"""Phase 4 tests: ingest, fix + proxy, LUT first, flub + silence map, retention loop.
Run with:  python3 -m unittest discover -s tests"""
from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import make_fixtures  # noqa: E402
from blkbin import (flubs, ingest, jobs, lut, media, project as project_mod, proxy, registry,  # noqa: E402
                    retention, settings, submit, youtube)
from blkbin.cli import listing  # noqa: E402


def make_cube(path: Path, n: int = 9, gain: float = 1.8) -> Path:
    rows = []
    for b in range(n):
        for g in range(n):
            for r in range(n):
                f = lambda v: min(1, max(0, (v / (n - 1) - 0.5) * gain + 0.5))  # noqa: E731
                rows.append(f"{f(r):.6f} {f(g):.6f} {f(b):.6f}")
    path.write_text(f'TITLE "test contrast"\nLUT_3D_SIZE {n}\n' + "\n".join(rows) + "\n")
    return path


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="blkbin-p4-"))
        os.environ["BLKBIN_HOME"] = str(self.tmp / "home")
        os.environ.pop("ANTHROPIC_API_KEY", None)
        settings.save({"export_path": str(self.tmp / "export.json")})
        project_mod._projects.clear()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


# ---- INGEST ------------------------------------------------------------------------------------

class TestIngest(Base):
    def setUp(self):
        super().setUp()
        self.volumes = self.tmp / "Volumes"
        card = self.volumes / "DJI_POCKET3" / "DCIM" / "DJIA_001"
        card.mkdir(parents=True)
        fx = make_fixtures.make(self.tmp / "fx")
        for name in ("DJI_20261011101233_0001_D.MP4", "DJI_20261011102045_0002_D.MP4"):
            shutil.copy2(fx / name, card / name)
        (card / "._DJI_20261011101233_0001_D.MP4").write_bytes(b"junk")
        self.card = card.parent
        self.t7 = self.volumes / "Untitled" / "project hhh"
        self.t7.mkdir(parents=True)
        os.environ["BLKBIN_VOLUMES"] = str(self.volumes)

    def tearDown(self):
        os.environ.pop("BLKBIN_VOLUMES", None)
        super().tearDown()

    def ingest(self, name="2026-10-11 desk vlog"):
        j = jobs.start("ingest", ingest.run, str(self.card), name, str(self.t7))
        j = jobs.wait(j["id"])
        self.assertEqual(j["state"], "done", j["error"])
        return j["result"]

    def test_detects_card_but_not_the_t7(self):
        found = ingest.sources()
        self.assertEqual([s["label"] for s in found], ["DJI_POCKET3"])
        self.assertEqual(found[0]["device"], "DJI")
        self.assertEqual(found[0]["files"], 2)  # the ._ junk file isn't counted

    def test_copies_verifies_and_never_touches_the_card(self):
        before = listing(self.card)
        r = self.ingest()
        self.assertTrue(r["safe_to_wipe"])
        self.assertEqual((r["files"], r["matched"]), (2, 2))
        raw = Path(r["raw"])
        self.assertEqual(sorted(p.name for p in raw.iterdir()),
                         ["DJI_20261011101233_0001_D.MP4", "DJI_20261011102045_0002_D.MP4"])
        self.assertEqual(listing(self.card), before)  # card: same files, sizes, checksums, times
        report = Path(r["report"]).read_text()
        self.assertIn("SAFE TO WIPE THE CARD", report)
        self.assertEqual(report.count(",match"), 2)

    def test_second_ingest_of_same_card_counts_files_already_there(self):
        self.ingest()
        r = self.ingest()
        self.assertTrue(r["safe_to_wipe"])
        self.assertEqual(len(list(Path(r["raw"]).iterdir())), 2)  # nothing duplicated

    def test_same_name_different_file_gets_suffix_not_overwrite(self):
        raw = self.t7 / "trip" / "_raw"
        raw.mkdir(parents=True)
        mine = raw / "DJI_20261011101233_0001_D.MP4"
        mine.write_bytes(b"a different file that happens to share the name")
        r = self.ingest("trip")
        self.assertTrue(r["safe_to_wipe"])
        self.assertEqual(mine.read_bytes(), b"a different file that happens to share the name")
        self.assertTrue((raw / "DJI_20261011101233_0001_D-2.MP4").exists())

    def test_checksum_mismatch_is_not_safe_to_wipe(self):
        real = ingest._sha256
        with mock.patch.object(ingest, "_sha256", lambda p: "bad" if "_raw" in str(p) else real(p)):
            r = self.ingest()
        self.assertFalse(r["safe_to_wipe"])
        self.assertEqual(len(r["problems"]), 2)
        self.assertIn("NOT safe to wipe", Path(r["report"]).read_text())

    def test_refuses_without_t7_or_space(self):
        with self.assertRaises(ingest.IngestError):
            ingest.plan(str(self.card), "x", str(self.tmp / "no-such-drive"))
        with mock.patch("shutil.disk_usage", return_value=mock.Mock(free=10)):
            with self.assertRaises(ingest.IngestError):
                ingest.plan(str(self.card), "x", str(self.t7))


# ---- LUT FIRST ------------------------------------------------------------------------------------

class TestLut(Base):
    def test_parse_rejects_bad_files(self):
        good = make_cube(self.tmp / "good.cube").read_text()
        self.assertEqual(lut.parse(good)["size"], 9)
        with self.assertRaises(lut.LutError):
            lut.parse("LUT_3D_SIZE 4\n0 0 0\n")
        with self.assertRaises(lut.LutError):
            lut.parse("LUT_1D_SIZE 4\n")
        with self.assertRaises(lut.LutError):
            lut.parse("hello")

    def test_creative_grade_is_not_taken_for_the_conversion(self):
        everyday = Path(__file__).resolve().parents[3] / "brand-bible/brands/assets/luts/blkgrlco/The Everyday LUT.cube"
        if not everyday.exists():
            self.skipTest("brand LUT not in this checkout")
        with self.assertRaises(lut.NotAConversion):
            lut.install(everyday.read_text(), everyday.name)
        self.assertIsNone(lut.path())
        lut.install(everyday.read_text(), everyday.name, force=True)  # her explicit "use it anyway"
        self.assertTrue(lut.status()["installed"])
        flat = make_cube(self.tmp / "flat.cube", gain=1.0).read_text()
        with self.assertRaises(lut.NotAConversion):
            lut.install(flat, "identity.cube")

    def test_install_keeps_the_previous_one(self):
        text = make_cube(self.tmp / "a.cube").read_text()
        lut.install(text, "DJI OSMO Pocket 3 D-Log M to Rec.709.cube")
        lut.install(text, "again.cube")
        self.assertTrue((lut.lut_dir() / "replaced-1.cube").exists())
        self.assertEqual(lut.status()["name"], "again.cube")

    def test_dji_frames_get_the_lut_iphone_frames_dont(self):
        folder = make_fixtures.make(self.tmp / "proj")
        before = listing(folder)
        proj = project_mod.open_project(str(folder))
        dji = next(e for e in proj.entries() if e["original_name"].startswith("DJI_20261011101233"))
        iph = next(e for e in proj.entries() if e["original_name"] == "IMG_4821.MOV")
        proj.analyze(dji["fid"])
        self.assertEqual(proj.state["files"][dji["fid"]]["lut"], "missing")  # no LUT installed yet
        flat = _contrast(proj.state_dir / "frames" / f"{dji['fid']}_2.jpg")
        lut.install(make_cube(self.tmp / "c.cube").read_text(), "c.cube")
        proj.analyze(dji["fid"])
        proj.analyze(iph["fid"])
        self.assertEqual(proj.state["files"][dji["fid"]]["lut"], "applied")
        self.assertIsNone(proj.state["files"][iph["fid"]]["lut"])
        graded = _contrast(proj.state_dir / "frames" / f"{dji['fid']}_2.jpg")
        self.assertGreater(graded, flat * 1.3)  # the LUT really changed the frame
        proj.update(dji["fid"], {"lut": False})  # the card's switch
        proj.analyze(dji["fid"])
        self.assertIsNone(proj.state["files"][dji["fid"]]["lut"])
        after = [r for r in listing(folder) if not r[0].startswith(".blkgrlco-bin")]
        self.assertEqual(after, [r for r in before if not r[0].startswith(".blkgrlco-bin")])  # originals untouched


class TestLook(Base):
    """Step 2: the channel's creative look, on card thumbnails only."""

    def setUp(self):
        super().setUp()
        lut.install(make_cube(self.tmp / "c.cube").read_text(), "c.cube")
        self.folder = make_fixtures.make(self.tmp / "proj")
        self.proj = project_mod.open_project(str(self.folder))
        self.pid = registry.for_folder(self.proj.root)["id"]
        for e in self.proj.entries():
            self.proj.analyze(e["fid"])

    def cards(self):
        return {c["original_name"]: c for c in self.proj.view()["cards"]}

    def test_blkgrlco_uses_the_everyday_lut_from_the_brand_bible(self):
        if not lut.BRAND_LOOKS["@blkgrlco"].is_file():
            self.skipTest("brand LUT not in this checkout")
        self.assertEqual(lut.look_path("@blkgrlco").name, "The Everyday LUT.cube")
        self.assertEqual(lut.looks_status()["@blkgrlco"]["source"], "brand bible")
        c = self.cards()
        self.assertTrue(c["DJI_20261011101233_0001_D.MP4"]["look"])
        self.assertTrue(c["IMG_4821.MOV"]["look"])                       # iPhone footage gets the grade too
        self.assertFalse(c["RPReplay_Final1760190000.MP4"]["look"])     # screen recordings don't
        self.assertFalse(c["IMG_4822.JPG"]["look"])

    def test_graded_thumbnail_leaves_what_claude_sees_alone(self):
        dji = self.cards()["DJI_20261011101233_0001_D.MP4"]
        base = self.proj.state_dir / "frames" / dji["frames"][0]
        before = base.read_bytes()
        look = make_cube(self.tmp / "look.cube", gain=0.5)  # an obvious low-contrast look
        graded = lut.graded_frame(base, look, self.proj.state_dir / "frames")
        self.assertNotEqual(graded, base)
        self.assertEqual(base.read_bytes(), before)                     # Claude's frame untouched
        self.assertLess(_contrast(graded), _contrast(base) * 0.8)
        self.assertEqual(lut.graded_frame(base, look, self.proj.state_dir / "frames"), graded)  # cached

    def test_per_channel_choice_and_switch(self):
        registry.update_details(self.pid, {"channel": "@blkgrlcotoo"})
        self.assertFalse(self.cards()["DJI_20261011101233_0001_D.MP4"]["look"])  # no default for the travel kit
        lut.install_look("@blkgrlcotoo", make_cube(self.tmp / "250d.cube").read_text(), "709to709_250D_x65_Clean_White.cube")
        self.assertTrue(self.cards()["DJI_20261011101233_0001_D.MP4"]["look"])
        self.assertEqual(lut.looks_status()["@blkgrlcotoo"]["name"], "709to709_250D_x65_Clean_White.cube")
        lut.set_look_on("@blkgrlcotoo", False)
        self.assertFalse(self.cards()["DJI_20261011101233_0001_D.MP4"]["look"])
        self.assertTrue(lut.looks_status()["@blkgrlcotoo"]["off"])

    def test_frame_route_serves_graded_and_plain(self):
        import threading
        import urllib.request
        from blkbin import server
        server._current.update(project=self.proj, plan_id=self.pid)
        lut.install_look("@blkgrlco", make_cube(self.tmp / "look.cube", gain=0.5).read_text(), "look.cube")
        httpd = server.serve(port=0)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            name = self.cards()["DJI_20261011101233_0001_D.MP4"]["frames"][0]
            url = f"http://127.0.0.1:{httpd.server_address[1]}/api/frame/"
            plain = urllib.request.urlopen(url + name).read()
            graded = urllib.request.urlopen(url + name.replace(".jpg", ".look.jpg")).read()
            self.assertEqual(plain, (self.proj.state_dir / "frames" / name).read_bytes())
            self.assertNotEqual(plain, graded)
        finally:
            httpd.shutdown()
            httpd.server_close()


def _contrast(p: Path) -> float:
    from PIL import Image, ImageStat
    with Image.open(p) as im:
        return ImageStat.Stat(im.convert("L")).stddev[0]


# ---- FIX + PROXY -------------------------------------------------------------------------------------

class TestFixProxy(Base):
    def test_broken_clip_gets_fixed_copy_and_videos_get_proxies(self):
        folder = make_fixtures.make(self.tmp / "proj")
        good = folder / "DJI_20261011101233_0001_D.MP4"
        bad = folder / "IMG_9999.MOV"
        data = bytearray(good.read_bytes())
        for i in range(len(data) // 20, len(data) // 20 + 6000, 5):  # scribble over the start of the video
            data[i] ^= 0xFF
        bad.write_bytes(bytes(data))
        bad_bytes = bad.read_bytes()
        proj = project_mod.open_project(str(folder))
        for e in proj.entries():
            proj._analyze_safe(e["fid"])
        bad_e = next(e for e in proj.entries() if e["original_name"] == "IMG_9999.MOV")
        self.assertTrue(bad_e.get("broken"), "the damaged clip should be flagged")
        todo = proxy.todo(proj)
        self.assertEqual([x["path"] for x in todo["fix"]], ["IMG_9999.MOV"])
        self.assertEqual(len(todo["proxy"]), 4)  # the other 4 videos
        j = jobs.wait(jobs.start("proxy", proxy.run, proj)["id"])
        self.assertEqual(j["state"], "done", j["error"])
        r = j["result"]
        self.assertEqual(r["errors"], [])
        self.assertTrue((folder / "IMG_9999_fixed.mp4").exists())
        self.assertEqual(bad.read_bytes(), bad_bytes)  # original kept exactly
        self.assertIsNone(proxy.decode_check(folder / "IMG_9999_fixed.mp4", None))
        px = folder / "_proxies" / "DJI_20261011101233_0001_D.mp4"
        self.assertTrue(px.exists())
        info = media.probe(px)
        self.assertEqual(info["video_codec"], "h264")
        self.assertLessEqual(min(info["width"], info["height"]), 720)
        # nothing left to do, the _fixed copy is a new card, and _proxies isn't scanned as footage
        self.assertEqual(proxy.todo(proj)["fix"], [])
        names = [e["original_name"] for e in proj.entries()]
        self.assertIn("IMG_9999_fixed.mp4", names)
        self.assertFalse(any("_proxies" in e["path"] for e in proj.entries()))

    def test_unrescuable_clip_is_reported_and_kept(self):
        folder = make_fixtures.make(self.tmp / "proj")
        cut = folder / "IMG_9998.MOV"
        cut.write_bytes((folder / "IMG_4821.MOV").read_bytes()[:3000])  # no index left: can't be rescued
        with self.assertRaises(RuntimeError):
            proxy.fix(cut)
        self.assertEqual(cut.stat().st_size, 3000)
        self.assertFalse(list(folder.glob("IMG_9998_fixed*")))

    def test_proxy_never_overwrites(self):
        folder = make_fixtures.make(self.tmp / "proj")
        (folder / "_proxies").mkdir()
        mine = folder / "_proxies" / "IMG_4821.mp4"
        mine.write_bytes(b"something of hers")
        out = proxy.make_proxy(folder / "IMG_4821.MOV", proxy.proxy_target(folder, "IMG_4821.MOV"))
        self.assertEqual(out.name, "IMG_4821-2.mp4")
        self.assertEqual(mine.read_bytes(), b"something of hers")


# ---- FLUB + SILENCE MAP --------------------------------------------------------------------------------

def W(start, word, dur=0.3, prob=0.9):
    return {"start": start, "end": start + dur, "word": " " + word, "prob": prob}


def seg(words, text=None):
    return {"start": words[0]["start"], "end": words[-1]["end"],
            "text": text or " ".join(w["word"].strip() for w in words), "words": words}


SEGMENTS = [
    seg([W(0.0, "So"), W(0.4, "the"), W(0.8, "thing"), W(1.2, "about"), W(1.6, "Sundays")]),
    seg([W(2.2, "lu-lu-lu", 0.6, 0.4)]),
    seg([W(3.5, "So"), W(3.9, "the"), W(4.3, "thing"), W(4.7, "about"), W(5.1, "Sundays"), W(5.5, "is"),
         W(5.9, "rest")]),
    seg([W(7.0, "um"), W(7.4, "okay"), W(10.0, "la"), W(10.3, "la"), W(10.6, "la")]),
    seg([W(11.5, "So"), W(11.9, "um"), W(12.3, "the"), W(12.7, "thing"), W(13.1, "about"), W(13.5, "Sundays"),
         W(13.9, "is"), W(14.3, "rest")]),
]


class TestFlubs(Base):
    def test_markers_including_split_la_la_la(self):
        words = [w for s in SEGMENTS for w in s["words"]]
        m = flubs.find_markers(words)
        self.assertEqual([round(x["t"], 1) for x in m], [2.2, 10.0])
        self.assertEqual(m[1]["text"], "la la la")
        self.assertEqual(flubs.find_markers([W(0, "la"), W(1, "vida")]), [])  # one "la" is just a word

    def test_voiced_gap_is_a_possible_flub_but_silence_is_not(self):
        words = [W(0, "hello"), W(2.0, "there"), W(4.0, "friend")]
        quiet = [[2.35, 3.95]]  # the second gap is silent
        gaps = flubs.find_voiced_gaps(words, quiet, [])
        self.assertEqual([g["t"] for g in gaps], [0.3])
        self.assertEqual(gaps[0]["kind"], "possible")

    def test_repeated_takes_are_grouped_and_ranked(self):
        words = [w for s in SEGMENTS for w in s["words"]]
        groups = flubs.find_takes(SEGMENTS, [], flubs.find_markers(words))
        self.assertEqual(len(groups), 1)
        takes = sorted(groups[0]["takes"], key=lambda t: t["start"])
        self.assertEqual([t["start"] for t in takes], [0.0, 3.5, 11.5])
        self.assertEqual(takes[0]["notes"].split(",")[0], "cut short")
        best = min(takes, key=lambda t: t["rank"])
        self.assertEqual(best["start"], 3.5)  # complete, no filler; the last take has an "um"
        self.assertIn("filler", takes[2]["notes"])

    def test_silences_with_ffmpeg(self):
        wav = self.tmp / "talk.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error",
                        "-f", "lavfi", "-i", "sine=f=300:d=1.5:sample_rate=44100",
                        "-f", "lavfi", "-t", "1.2", "-i", "anullsrc=r=44100:cl=mono",
                        "-f", "lavfi", "-i", "sine=f=300:d=1.5:sample_rate=44100",
                        "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", str(wav)], check=True)
        quiet = flubs.silences(wav, -35, 0.7)
        self.assertEqual(len(quiet), 1)
        self.assertAlmostEqual(quiet[0][0], 1.5, delta=0.1)
        self.assertAlmostEqual(quiet[0][1] - quiet[0][0], 1.2, delta=0.15)

    def test_project_map_goes_into_footage_master_with_history(self):
        folder = make_fixtures.make(self.tmp / "proj")
        proj = project_mod.open_project(str(folder))
        for e in proj.entries():
            proj.analyze(e["fid"])
        submit.refresh_master(proj)  # a first version, to prove it's kept
        with mock.patch.object(flubs, "transcribe", return_value=SEGMENTS):
            j = jobs.wait(jobs.start("flubs", flubs.run, proj)["id"])
        self.assertEqual(j["state"], "done", j["error"])
        self.assertEqual(j["result"]["mapped"], 1)  # only the talking clip
        text = (folder / "_footage-master.md").read_text()
        self.assertIn("## Flub & silence map", text)
        self.assertIn("### DJI_20261011101233_0001_D.MP4", text)
        self.assertIn("flub marker", text)
        self.assertIn("Repeated takes", text)
        self.assertEqual(len(list((proj.state_dir / "history").glob("_footage-master.before-map-*.md"))), 1)
        card = next(c for c in proj.view()["cards"] if c["original_name"].startswith("DJI_20261011101233"))
        self.assertEqual(card["flubs"]["markers"], 2)


# ---- RETENTION LOOP ---------------------------------------------------------------------------------------

def curve(drops_at: dict, n: int = 100) -> list[list[float]]:
    """A gently falling curve with sudden drops at the given step indexes."""
    y, pts = 1.0, []
    for i in range(n + 1):
        y -= 0.002 + drops_at.get(i, 0)
        pts.append([round(i / n, 2), round(y, 4), 0.5])
    return pts


class TestRetention(Base):
    def test_parse_video_id(self):
        for s in ("https://www.youtube.com/watch?v=abcdefghijk", "https://youtu.be/abcdefghijk?t=3",
                  "https://youtube.com/shorts/abcdefghijk", "abcdefghijk"):
            self.assertEqual(retention.parse_video_id(s), "abcdefghijk")
        with self.assertRaises(ValueError):
            retention.parse_video_id("not a link")

    def test_drops_match_the_clip_playing(self):
        pts = curve({10: 0.08, 60: 0.03, 61: 0.03})  # a sharp drop at 10%, a two-step one at 60%
        drops = retention.find_drops(pts, 200)
        self.assertEqual([d["t"] for d in drops], [20.0, 120.0])
        order = [{"fid": "a", "name": "intro.mp4", "category": "talking-head", "seconds": 15},
                 {"fid": "b", "name": "walk.mp4", "category": "b-roll", "seconds": 90},
                 {"fid": "c", "name": "desk.mp4", "category": "talking-head", "seconds": 95}]
        matched, note = retention.match(drops, order, 200)
        self.assertEqual([m["clip"] for m in matched], ["walk.mp4", "desk.mp4"])
        self.assertEqual(note, "")
        _, note = retention.match(drops, order[:2], 200)
        self.assertIn("scaled", note)

    def test_scheduled_pulls_and_the_loses_viewers_table(self):
        pid = registry.add_ideas("sunday reset")["added"][0]
        plan = registry.get(pid)
        plan["edit"] = {"video_id": "abcdefghijk", "channel_id": "UC1", "duration": 200,
                        "published": "2026-10-20T15:00:00Z",
                        "order": [{"fid": "a", "name": "intro.mp4", "category": "talking-head", "seconds": 15},
                                  {"fid": "b", "name": "walk.mp4", "category": "b-roll", "seconds": 185}]}
        registry.save(plan)
        youtube._write_private("channels.json", {"UC1": {"title": "BLKGRLCO", "handle": "@blkgrlco", "token": {}}})
        calls = []

        def fake_retention(cid, vid, start, end):
            calls.append((cid, vid, start, end))
            return curve({50: 0.09})

        t_1d = dt.datetime(2026, 10, 21, 15, 0, tzinfo=dt.timezone.utc)
        t_3d = dt.datetime(2026, 10, 23, 15, 0, tzinfo=dt.timezone.utc)
        t_8d = dt.datetime(2026, 10, 28, 16, 0, tzinfo=dt.timezone.utc)
        with mock.patch.object(youtube, "retention", fake_retention):
            self.assertEqual(retention.run_due(t_1d), [])               # too early
            self.assertEqual(retention.run_due(t_3d), ["sunday reset 48h"])
            self.assertEqual(retention.run_due(t_3d), [])               # not pulled twice
            self.assertEqual(retention.run_due(t_8d), ["sunday reset 7d"])  # caught up after a sleep
        self.assertEqual(calls[0][2], "2026-10-20")
        snap = registry.get(pid)["retention"]["7d"]
        self.assertEqual(snap["drops"][0]["clip"], "walk.mp4")
        self.assertEqual(snap["step_seconds"], 2.0)
        table = retention.loses_viewers()
        rows = {r["category"]: r for r in table["rows"]}
        self.assertEqual(rows["b-roll"]["drops"], 1)
        self.assertEqual(rows["talking-head"]["drops"], 0)
        self.assertEqual(rows["b-roll"]["name"], "B-Roll")

    def test_edit_order_change_rematches_without_calling_youtube(self):
        pid = registry.add_ideas("x")["added"][0]
        plan = registry.get(pid)
        plan["edit"] = {"video_id": "abcdefghijk", "duration": 100, "order": [
            {"fid": "a", "name": "one.mp4", "category": "b-roll", "seconds": 100}]}
        plan["retention"] = {"48h": {"points": curve({20: 0.1}), "duration": 100, "drops": [], "note": ""}}
        registry.save(plan)
        retention.reanalyze(pid)
        self.assertEqual(registry.get(pid)["retention"]["48h"]["drops"][0]["clip"], "one.mp4")

    def test_hold_at_interpolates(self):
        pts = [[0.0, 1.0], [0.01, 0.9], [0.02, 0.8]]
        self.assertAlmostEqual(youtube.hold_at(pts, 3, 200), 0.85)  # 3s = 1.5% of 200s
        self.assertIsNone(youtube.hold_at(pts, 30, 20))


if __name__ == "__main__":
    unittest.main()
