"""Run with:  python3 -m unittest discover -s tests -v   (from apps/blkgrlco-bin)"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import make_fixtures  # noqa: E402
from blkbin import cli, media, naming, project as project_mod, settings, submit  # noqa: E402

FIXTURE_CACHE = None


def fixture_copy(dst: Path) -> Path:
    """Build the synthetic project once, then copy it for each test."""
    global FIXTURE_CACHE
    import shutil
    if FIXTURE_CACHE is None:
        FIXTURE_CACHE = Path(tempfile.mkdtemp(prefix="blkbin-fixture-")) / "2026-10-11 desk vlog"
        make_fixtures.make(FIXTURE_CACHE)
    shutil.copytree(FIXTURE_CACHE, dst, copy_function=shutil.copy2)
    return dst


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="blkbin-test-"))
        os.environ["BLKBIN_HOME"] = str(self.tmp / "home")
        os.environ.pop("ANTHROPIC_API_KEY", None)
        project_mod._projects.clear()
        self.root = fixture_copy(self.tmp / "2026-10-11 desk vlog")

    def analyzed(self):
        proj = project_mod.open_project(str(self.root))
        for e in proj.entries():
            proj.analyze(e["fid"])
        return proj


class TestScanning(Base):
    def test_skips_appledouble_and_finds_all_kinds(self):
        names = sorted(p.name for p in media.scan(self.root))
        self.assertNotIn("._DJI_20261011101233_0001_D.MP4", names)
        self.assertEqual(len(names), 7)
        kinds = {p.name: media.kind_of(p) for p in media.scan(self.root)}
        self.assertEqual(kinds["IMG_4821.MOV"], "video")
        self.assertEqual(kinds["whoosh.wav"], "audio")
        self.assertEqual(kinds["IMG_4822.JPG"], "photo")

    def test_devices_dates_orientation(self):
        proj = self.analyzed()
        by = {e["original_name"]: e for e in proj.entries()}
        dji = by["DJI_20261011101233_0001_D.MP4"]
        self.assertEqual(dji["device"], "DJI Osmo Pocket 3")
        self.assertEqual(dji["date"], "2026-10-11")
        self.assertEqual(dji["orientation"], "vertical")
        self.assertEqual(len(dji["frames"]), 3)
        iphone = by["IMG_4821.MOV"]
        self.assertIn("iPhone", iphone["device"])
        self.assertEqual(iphone["date"], "2026-10-12")
        self.assertEqual(iphone["orientation"], "horizontal")
        self.assertEqual(by["IMG_4822.JPG"]["date"], "2026-10-12")
        self.assertEqual(by["RPReplay_Final1760190000.MP4"]["device"], "Screen recording")

    def test_rules_categories_without_claude(self):
        proj = self.analyzed()
        by = {e["original_name"]: e["category"] for e in proj.entries()}
        self.assertEqual(by["DJI_20261011101233_0001_D.MP4"], "talking-head")
        self.assertEqual(by["DJI_20261011102045_0002_D.MP4"], "b-roll")
        self.assertEqual(by["RPReplay_Final1760190000.MP4"], "screen-recording")
        self.assertEqual(by["ES_Sunday Morning - Blue Steel.mp3"], "music")
        self.assertEqual(by["whoosh.wav"], "sound-effects")
        self.assertEqual(by["IMG_4822.JPG"], "photos")


class TestNaming(Base):
    def test_default_format_matches_example(self):
        cfg = settings.load()
        entry = {"path": "DJI_X.MP4", "original_name": "DJI_X.MP4", "date": "2026-10-11",
                 "category": "talking-head", "analysis": {"title": "Desk intro"}}
        self.assertEqual(naming.propose(entry, cfg, "p"), "2026-10-11_talking-head-desk-intro.mp4")
        entry["analysis"]["title"] = "talking head desk intro"  # no doubled category
        self.assertEqual(naming.propose(entry, cfg, "p"), "2026-10-11_talking-head-desk-intro.mp4")

    def test_other_formats(self):
        cfg = settings.load()
        entry = {"path": "IMG_1.MOV", "original_name": "IMG_1.MOV", "date": "2026-10-11",
                 "category": "b-roll", "analysis": {"title": "coffee pour"}}
        cfg["name_format"] = "date_title"
        self.assertEqual(naming.propose(entry, cfg, "p"), "2026-10-11_coffee-pour.mov")
        cfg["name_format"] = "date_category_seq"
        self.assertEqual(naming.propose(entry, cfg, "p", seq=4), "2026-10-11_b-roll_004.mov")
        cfg["name_format"] = "keep"
        self.assertEqual(naming.propose(entry, cfg, "p"), "IMG_1.MOV")


class TestSubmitUndo(Base):
    def snapshot(self):
        return cli.listing(self.root)

    def test_dry_run_changes_nothing(self):
        proj = self.analyzed()
        before = self.snapshot()
        p = submit.plan(proj)
        self.assertEqual(len(p["ops"]), 7)
        self.assertEqual(before, self.snapshot())
        self.assertFalse((self.root / submit.LOG_NAME).exists())

    def test_submit_then_undo_restores_everything(self):
        proj = self.analyzed()
        before = self.snapshot()
        p = submit.plan(proj)
        r = submit.apply(proj, p["plan_id"])
        self.assertEqual(r["applied"], 7)
        self.assertEqual(r["errors"], [])
        # moved into category folders, content untouched
        mid = {row[0]: row[2] for row in self.snapshot() if row[0] != submit.MASTER_NAME}
        self.assertIn("Talking Head/2026-10-11_talking-head-dji-20261011101233-0001-d.mp4", mid)
        self.assertIn("Photos/2026-10-12_photos-img-4822.jpg", mid)
        self.assertEqual(sorted(h for h in mid.values() if h), sorted(row[2] for row in before if row[2]))
        # log + master written
        with open(self.root / submit.LOG_NAME) as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(len(rows), 7)
        self.assertTrue(all(r["old_path"] and r["new_path"] and r["timestamp"] for r in rows))
        master = (self.root / submit.MASTER_NAME).read_text()
        self.assertEqual(master.count("\n| 2026-"), 7)
        # every card now says Saved
        self.assertTrue(all(c["status"] == "saved" for c in proj.view()["cards"]))
        # undo
        u = submit.undo(proj)
        self.assertEqual(u["restored"], 7)
        self.assertEqual(u["conflicts"], [])
        self.assertEqual(before, self.snapshot())  # paths, sizes, checksums, mtimes
        self.assertTrue((self.root / "Talking Head").is_dir())  # existed before: kept
        self.assertFalse((self.root / "B-Roll").exists())       # created by submit: removed
        with open(self.root / submit.LOG_NAME) as f:
            self.assertEqual(sum(1 for r in csv.DictReader(f) if r["action"] == "undo"), 7)
        with self.assertRaises(submit.SubmitError):
            submit.undo(proj)

    def test_never_overwrites_existing_name(self):
        proj = self.analyzed()
        taken = self.root / "Talking Head" / "2026-10-11_talking-head-dji-20261011101233-0001-d.mp4"
        taken.write_bytes(b"someone else's file")
        p = submit.plan(proj)
        op = next(o for o in p["ops"] if o["src"] == "DJI_20261011101233_0001_D.MP4")
        self.assertEqual(op["dst"], "Talking Head/2026-10-11_talking-head-dji-20261011101233-0001-d-2.mp4")
        self.assertTrue(op["suffixed"])
        submit.apply(proj, p["plan_id"])
        self.assertEqual(taken.read_bytes(), b"someone else's file")

    def test_two_clips_same_proposed_name_get_suffix(self):
        proj = self.analyzed()
        for e in proj.entries():
            if e["original_name"].startswith("DJI_"):
                proj.update(e["fid"], {"category": "b-roll", "title": "same thing"})
        p = submit.plan(proj)
        dsts = sorted(o["dst"] for o in p["ops"] if o["category"] == "b-roll")
        self.assertIn("B-Roll/2026-10-11_b-roll-same-thing.mp4", dsts)
        self.assertIn("B-Roll/2026-10-11_b-roll-same-thing-2.mp4", dsts)

    def test_apply_refuses_stale_plan(self):
        proj = self.analyzed()
        p = submit.plan(proj)
        e = next(e for e in proj.entries() if e["kind"] == "photo")
        proj.update(e["fid"], {"title": "golden hour"})
        with self.assertRaises(submit.SubmitError):
            submit.apply(proj, p["plan_id"])

    def test_undo_never_overwrites(self):
        proj = self.analyzed()
        p = submit.plan(proj)
        submit.apply(proj, p["plan_id"])
        (self.root / "whoosh.wav").write_bytes(b"new file with the old name")
        u = submit.undo(proj)
        self.assertEqual(u["restored"], 6)
        self.assertEqual(len(u["conflicts"]), 1)
        self.assertEqual((self.root / "whoosh.wav").read_bytes(), b"new file with the old name")

    def test_skipped_and_manual_category(self):
        proj = self.analyzed()
        by = {e["original_name"]: e for e in proj.entries()}
        proj.update(by["IMG_4821.MOV"]["fid"], {"category": "talking-head"})
        proj.update(by["whoosh.wav"]["fid"], {"include": False})
        p = submit.plan(proj)
        srcs = {o["src"]: o["dst"] for o in p["ops"]}
        self.assertNotIn("whoosh.wav", srcs)
        self.assertTrue(srcs["IMG_4821.MOV"].startswith("Talking Head/"))

    def test_renamed_category_moves_files_on_next_submit(self):
        proj = self.analyzed()
        submit.apply(proj, submit.plan(proj)["plan_id"])
        cfg = settings.load()
        for c in cfg["categories"]:
            if c["id"] == "b-roll":
                c["name"] = "Cutaways"
        settings.save(cfg)
        p = submit.plan(proj)
        self.assertTrue(all(o["dst"].startswith("Cutaways/") for o in p["ops"]))
        self.assertEqual(len(p["ops"]), 2)


class TestSafety(Base):
    def test_refuses_whole_project_hhh(self):
        hhh = self.tmp / "project hhh"
        hhh.mkdir()
        with self.assertRaises(project_mod.ProjectError):
            project_mod.open_project(str(hhh))

    def test_server_rejects_cross_site_posts(self):
        from blkbin import server
        httpd = server.serve(port=0)
        port = httpd.server_address[1]
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/submit/undo", data=b"{}", method="POST")
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(req)
            self.assertEqual(ctx.exception.code, 403)
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/project/open",
                                         data=json.dumps({"path": str(self.root)}).encode(),
                                         method="POST", headers={"X-Bin": "1"})
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(len(json.load(resp)["cards"]), 7)
        finally:
            httpd.shutdown()


if __name__ == "__main__":
    unittest.main()
