"""Phase 2 (Plan tab) tests. Run with:  python3 -m unittest discover -s tests"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import make_thumbs  # noqa: E402
from blkbin import planning, registry, settings, thumbs, vision  # noqa: E402

THUMBS = None


def thumb_fixtures() -> tuple[Path, dict]:
    global THUMBS
    if THUMBS is None:
        d = Path(tempfile.mkdtemp(prefix="blkbin-thumbs-"))
        THUMBS = (d, make_thumbs.make(d))
    return THUMBS


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="blkbin-plan-"))
        os.environ["BLKBIN_HOME"] = str(self.tmp / "home")
        os.environ.pop("ANTHROPIC_API_KEY", None)
        settings.save({"export_path": str(self.tmp / "export" / "bin-export.json")})
        self.folder = self.tmp / "2026-10-11 desk vlog"
        self.folder.mkdir()
        self.plan = registry.for_folder(self.folder)
        self.pid = self.plan["id"]


class TestRegistry(Base):
    def test_folder_gets_one_plan(self):
        again = registry.for_folder(self.folder)
        self.assertEqual(again["id"], self.pid)
        self.assertEqual(again["details"]["name"], "2026-10-11 desk vlog")
        self.assertTrue((self.folder / ".blkgrlco-bin" / "project.json").exists())

    def test_details_validation(self):
        registry.update_details(self.pid, {"channel": "@blkgrlcotoo", "format": "weekly long-form",
                                           "post_date": "2026-11-01", "status": "in-progress"})
        d = registry.get(self.pid)["details"]
        self.assertEqual((d["channel"], d["status"], d["post_date"]), ("@blkgrlcotoo", "in-progress", "2026-11-01"))
        with self.assertRaises(ValueError):
            registry.update_details(self.pid, {"channel": "@nope"})
        with self.assertRaises(ValueError):
            registry.update_details(self.pid, {"post_date": "next week"})

    def test_pasted_title_list_and_long_form_rule(self):
        registry.add_titles(self.pid, "1. i quit my 9-5\n- what nobody tells you\n\n3 days in mexico city\ni quit my 9-5")
        plan = registry.get(self.pid)
        self.assertEqual([t["text"] for t in plan["titles"]],
                         ["i quit my 9-5", "what nobody tells you", "3 days in mexico city"])
        self.assertTrue(registry.title_check(plan)["ok"])
        registry.update_title(self.pid, plan["titles"][2]["id"], {"remove": True})
        check = registry.title_check(registry.get(self.pid))
        self.assertEqual((check["need"], check["written"], check["ok"]), (3, 2, False))
        registry.update_details(self.pid, {"format": "daily short"})
        self.assertTrue(registry.title_check(registry.get(self.pid))["ok"])

    def test_ticked_titles_reach_the_export_file(self):
        registry.add_titles(self.pid, "title one\ntitle two\ntitle three")
        t = registry.get(self.pid)["titles"]
        registry.update_title(self.pid, t[1]["id"], {"approved": True})
        data = json.loads(registry.export_path().read_text())
        proj = next(p for p in data["projects"] if p["id"] == self.pid)
        self.assertEqual([x["text"] for x in proj["titles"]], ["title two"])
        self.assertEqual(proj["folder"], str(self.folder))
        self.assertEqual(data["source"], "BLKGRLCO Bin")
        registry.update_title(self.pid, t[1]["id"], {"approved": False})
        data = json.loads(registry.export_path().read_text())
        self.assertEqual(next(p for p in data["projects"] if p["id"] == self.pid)["titles"], [])


    def test_copied_folder_gets_its_own_plan(self):
        import shutil
        copy = self.tmp / "copy"
        shutil.copytree(self.folder, copy)  # carries .blkgrlco-bin/project.json along
        other = registry.for_folder(copy)
        self.assertNotEqual(other["id"], self.pid)
        self.assertEqual(registry.get(self.pid)["folder"], str(self.folder))

    def test_moved_folder_keeps_its_plan(self):
        moved = self.tmp / "renamed drive"
        self.folder.rename(moved)
        self.assertEqual(registry.for_folder(moved)["id"], self.pid)

    def test_bin_test_copies_stay_out_of_the_export(self):
        with mock.patch.object(Path, "home", return_value=self.tmp):
            registry.new_plan("a test copy", str(self.tmp / "bin-test" / "x"))
            names = [p["name"] for p in registry.build_export()["projects"]]
        self.assertNotIn("a test copy", names)
        self.assertIn("2026-10-11 desk vlog", names)


class TestThumbnails(Base):
    def upload_all(self):
        d, facts = thumb_fixtures()
        for name in ["corner.png", "clean.png", "cluttered.png"]:
            planning.add_thumbnail(self.pid, name, (d / name).read_bytes())
        return facts

    def test_upload_score_rank_with_claude_readings(self):
        facts = self.upload_all()
        plan = registry.get(self.pid)
        self.assertEqual([t["label"] for t in plan["thumbs"]], ["A", "B", "C"])
        by_file = {t["id"]: t["original_name"] for t in plan["thumbs"]}
        with mock.patch.object(vision, "thumbnail_facts", side_effect=lambda p, cfg: facts[by_file[p.stem]]):
            plan = planning.score_all(self.pid)
        ranked = sorted(plan["thumbs"], key=lambda t: t["rank"])
        self.assertEqual([t["original_name"] for t in ranked], ["clean.png", "corner.png", "cluttered.png"])
        top = ranked[0]
        self.assertTrue(all(c["ok"] for c in top["checks"]))
        failed = {c["id"] for c in ranked[2]["checks"] if c["ok"] is False}
        self.assertTrue({"corner", "clutter", "words", "readable", "face"} <= failed)
        self.assertTrue((planning.thumbs_dir(self.pid) / top["previews"]["cb"]).exists())

    def test_scoring_without_claude_keeps_local_checks(self):
        self.upload_all()
        plan = planning.score_all(self.pid)
        for t in plan["thumbs"]:
            ids = {c["id"]: c["ok"] for c in t["checks"]}
            self.assertIsNone(ids["words"])
            self.assertIsNone(ids["face"])
            self.assertIn(ids["corner"], (True, False))
        cluttered = next(t for t in plan["thumbs"] if t["original_name"] == "cluttered.png")
        self.assertEqual(cluttered["rank"], 3)

    def test_colorblind_check(self):
        d, facts = thumb_fixtures()
        r = thumbs.score(d / "redgreen.png", facts["redgreen.png"])
        cb = next(c for c in r["checks"] if c["id"] == "colorblind")
        self.assertFalse(cb["ok"])
        r = thumbs.score(d / "clean.png", facts["clean.png"])
        self.assertTrue(next(c for c in r["checks"] if c["id"] == "colorblind")["ok"])

    def test_link_and_remove_keeps_the_image(self):
        self.upload_all()
        registry.add_titles(self.pid, "my title")
        plan = registry.get(self.pid)
        th, title = plan["thumbs"][0], plan["titles"][0]
        planning.update_thumbnail(self.pid, th["id"], {"title_id": title["id"]})
        registry.update_title(self.pid, title["id"], {"approved": True})
        exp = json.loads(registry.export_path().read_text())
        proj = next(p for p in exp["projects"] if p["id"] == self.pid)
        self.assertEqual(proj["titles"][0]["thumbnails"][0]["label"], "A")
        planning.remove_thumbnail(self.pid, th["id"])
        self.assertTrue((planning.thumbs_dir(self.pid) / "removed" / th["file"]).exists())
        self.assertEqual(len(registry.get(self.pid)["thumbs"]), 2)

    def test_rejects_non_images(self):
        with self.assertRaises(ValueError):
            planning.add_thumbnail(self.pid, "notes.txt", b"hello")


class TestScript(Base):
    def test_cues_in_order_with_lines(self):
        music = [{"fid": "aaaaaaaaaaaaaaaa", "name": "sunday morning.mp3"}]
        text = "cold open\n@[sunday morning.mp3](aaaaaaaaaaaaaaaa) plays as I walk in\nlater @[gone.mp3](bbbbbbbbbbbbbbbb)"
        planning.set_script(self.pid, text)
        cues = planning.cues(registry.get(self.pid)["script"], music)
        self.assertEqual([(c["line"], c["name"], c["missing"]) for c in cues],
                         [(2, "sunday morning.mp3", False), (3, "gone.mp3", True)])
        self.assertIn("♪sunday morning.mp3 plays", cues[0]["context"])


if __name__ == "__main__":
    unittest.main()
