"""Phase 5 (Strategy tab) tests with a fake YouTube and a fake Claude.
Run with:  python3 -m unittest discover -s tests"""
from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from blkbin import jobs, project as project_mod, registry, server, settings, strategy, youtube  # noqa: E402

TODAY = dt.date(2026, 10, 27)


def iso(days_ago: int) -> str:
    return (dt.datetime.combine(TODAY, dt.time(15)) - dt.timedelta(days=days_ago)).isoformat() + "Z"


def uploads_for(cid: str, base: int, hits: dict) -> list[dict]:
    """40 uploads, newest first: `base` views each, except index -> views in `hits`."""
    return [{"id": f"{cid[2:4]}{cid[-3:]}v{i:05d}", "channel_id": cid, "title": f"{cid} video {i}",
             "views": hits.get(i, base), "published": iso(7 * i + 1), "duration": 600, "description": "",
             "thumbnail": None} for i in range(40)]


# 12 small channels with a 4x hit at index 2, 2 big ones; one hit is older than a year (index 60 doesn't exist)
CHANNELS = {f"UCsmall{n:017d}": {"subs": 20_000 + n * 1000, "base": 1000 + n * 100, "hits": {2: (1000 + n * 100) * 4}}
            for n in range(12)}
CHANNELS["UCbig0000000000000000000"] = {"subs": 500_000, "base": 50_000, "hits": {1: 400_000}}
CHANNELS["UCown0000000000000000000"] = {"subs": 120, "base": 50, "hits": {}}


def fake_data(path, params, prefer=None):
    if path == "search":
        return {"items": [{"snippet": {"channelId": cid}} for cid in CHANNELS]}
    if path == "channels" and "forHandle" in params:
        return {"items": [{"id": "UCsmall00000000000000000"}]}
    if path == "channels":
        return {"items": [{"id": cid, "snippet": {"title": cid, "customUrl": "@" + cid[:8]},
                           "statistics": {"subscriberCount": str(CHANNELS[cid]["subs"]), "videoCount": "40",
                                          "viewCount": str(CHANNELS[cid]["base"] * 40)}}
                          for cid in params["id"].split(",") if cid in CHANNELS]}
    raise AssertionError(path)


def fake_uploads(cid, limit=50, prefer=None):
    c = CHANNELS[cid]
    return uploads_for(cid, c["base"], c["hits"])


class FakeClaude:
    def __init__(self):
        self.prompts = []

    def __call__(self, system, prompt, schema, effort="medium"):
        self.prompts.append((system, prompt))
        ids = [line.split(" | ")[0].strip() for line in prompt.splitlines() if " | " in line]
        props = schema["properties"]
        if "topics" in props:
            half = len(ids) // 2
            return {"topics": [
                {"name": "sunday resets", "video_ids": ids[:half] + ["notarealid1"], "audience_fit": 4, "fit_why": "core",
                 "filmable": 4, "film_why": "at home", "funnel": "Top", "idea": "my sunday reset, honestly"},
                {"name": "budget travel", "video_ids": ids[half:], "audience_fit": 2, "fit_why": "some",
                 "filmable": 1, "film_why": "needs a trip", "funnel": "Middle", "idea": "a cheap weekend away"},
                {"name": "ghost topic", "video_ids": ["nope"], "audience_fit": 4, "fit_why": "", "filmable": 4,
                 "film_why": "", "funnel": "Bottom", "idea": "x"}]}
        if "skeletons" in props:
            return {"skeletons": [
                {"pattern": "i tried [thing] for [time]", "video_ids": ids[:3], "why_it_works": "a promise"},
                {"pattern": "lonely skeleton", "video_ids": ids[:1], "why_it_works": "only one"}]}
        if "hooks" in props:
            return {"hooks": [{"hook": "i stopped doing sunday resets and nothing broke", "title": "I Quit Sunday Resets",
                               "stops_scroll": True, "why": "opinion"},
                              {"hook": "Sunday resets are a scam. Here is why.", "title": "t", "stops_scroll": False,
                               "why": "two sentences"}]}
        if "videos" in props:
            return {"videos": [{"video_id": i, "topic": "Sunday Reset" if n % 2 == 0 else "travel",
                                "format": "vlog", "skeleton": "none", "story": "unknown"} for n, i in enumerate(ids)]}
        if "patterns" in props:
            above = [line.split(" | ")[0] for line in prompt.splitlines() if " | above | " in line]
            return {"patterns": [{"name": "resets win", "template": "my [day] reset", "finding": "f",
                                  "proof_video_ids": above[:3]},
                                 {"name": "made up", "template": "x", "finding": "f", "proof_video_ids": ["zzzzzzzzzzz"]}]}
        if "matches" in props:
            return {"matches": [{"video_id": i, "skeleton": "i tried [thing] for [time]" if n % 2 else "none"}
                                for n, i in enumerate(ids)]}
        raise AssertionError(schema)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="blkbin-p5-"))
        os.environ["BLKBIN_HOME"] = str(self.tmp / "home")
        os.environ.pop("ANTHROPIC_API_KEY", None)
        settings.save({"export_path": str(self.tmp / "export.json")})
        youtube._write_private("channels.json", {"UCown0000000000000000000": {
            "title": "BLKGRLCO", "handle": "@blkgrlco", "token": {}}})
        self.claude = FakeClaude()
        self.patches = [mock.patch.object(youtube, "data", fake_data),
                        mock.patch.object(youtube, "channel_uploads", fake_uploads),
                        mock.patch.object(strategy, "_claude", self.claude)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def bullseye(self):
        strategy.save_profile("nia", {"lanes": "sunday reset\nsoft life routine", "goals": "feel in control",
                                      "seed_channels": "@someone"})
        j = jobs.wait(jobs.start("bullseye", strategy.run_bullseye, "@blkgrlco", TODAY)["id"])
        self.assertEqual(j["state"], "done", j["error"])
        return j["result"]


class TestProfiles(Base):
    def test_never_replaced_without_her_yes(self):
        r = strategy.save_profile("nia", {"goals": "feel in control", "who": "late 20s"})
        self.assertTrue(r["saved"])  # filling empty fields
        self.assertEqual(r["profiles"]["nia"]["missing"], ["tried", "where_watch"])
        r = strategy.save_profile("nia", {"goals": "something else"})
        self.assertFalse(r["saved"])
        self.assertTrue(r["needs_confirm"])
        self.assertEqual(r["changes"][0]["old"], "feel in control")
        self.assertEqual(strategy.profiles()["nia"]["goals"], "feel in control")
        r = strategy.save_profile("nia", {"goals": "something else"}, confirm=True)
        self.assertEqual(strategy.profiles()["nia"]["goals"], "something else")

    def test_rules_guarded_too(self):
        strategy.save_rules({"oct21": "lowercase. one sentence."})
        self.assertFalse(strategy.save_rules({"oct21": "new"})["saved"])
        self.assertEqual(strategy.rules()["oct21"], "lowercase. one sentence.")


class TestBullseye(Base):
    def test_outlier_score_uses_median_of_last_30(self):
        ups = uploads_for("UCx", 1000, {0: 5000, 35: 9000})
        sc = strategy.score_uploads(ups, TODAY)
        self.assertEqual(sc["median"], 1000)
        scores = {v["id"]: v["score"] for v in sc["recent"]}
        self.assertEqual(scores[ups[0]["id"]], 5.0)
        self.assertEqual(scores[ups[35]["id"]], 9.0)  # older than the last 30, but inside 12 months
        self.assertTrue(all((TODAY - dt.date.fromisoformat(v["published"][:10])).days <= 365 for v in sc["recent"]))

    def test_run_picks_small_channels_and_scores_topics(self):
        r = self.bullseye()
        ids = [c["id"] for c in r["channels"]]
        self.assertEqual(len(ids), 12)  # 12 small channels qualify; the big one isn't needed
        self.assertNotIn("UCown0000000000000000000", ids)  # her own channel is never a competitor
        self.assertTrue(all(c["subs"] < 100_000 for c in r["channels"]))
        self.assertEqual(len(r["outliers"]), 12)
        self.assertTrue(all(o["score"] >= 3 for o in r["outliers"]))
        self.assertTrue(all(o["url"].startswith("https://www.youtube.com/watch?v=") for o in r["outliers"]))
        names = [t["name"] for t in r["topics"]]
        self.assertEqual(names, ["sunday resets", "budget travel"])  # the ghost topic had no real videos
        top = r["topics"][0]
        self.assertEqual(top["parts"], {"audience_fit": 4, "demand": 3, "gap": 4, "filmable": 4})
        self.assertEqual((top["score"], top["ring"]), (15, "bullseye"))
        self.assertNotIn("notarealid1", top["video_ids"])

    def test_send_topic_goes_to_the_idea_bank_and_export(self):
        r = self.bullseye()
        strategy.send_topic("@blkgrlco", r["topics"][0]["id"])
        names = [p["details"]["name"] for p in registry.all_plans()]
        self.assertIn("my sunday reset, honestly", names)
        exp = json.loads((self.tmp / "export.json").read_text())
        self.assertIn("my sunday reset, honestly", [p["name"] for p in exp["projects"]])
        self.assertTrue(strategy.bullseye("@blkgrlco")["topics"][0]["sent"])

    def test_needs_lanes(self):
        with self.assertRaises(strategy.StrategyError):
            strategy.run_bullseye(strategy._QuietJob(), "@blkgrlcotoo", TODAY)


class TestHookMachine(Base):
    def test_skeletons_need_two_real_videos(self):
        self.bullseye()
        self.assertEqual(strategy.set_openings("https://youtu.be/sm002v00002\tso here's the thing")["imported"], 1)
        r = strategy.build_skeletons(strategy._QuietJob(), "@blkgrlco")
        self.assertEqual([s["pattern"] for s in r["skeletons"]], ["i tried [thing] for [time]"])
        s = r["skeletons"][0]
        self.assertEqual(s["count"], 3)
        self.assertEqual(len(s["examples"]), 3)
        self.assertGreaterEqual(s["median_score"], 3)

    def test_hook_checks(self):
        ok = strategy.hook_checks("day 12 of 90 and i finally get it", "Day 12 of 90: soft mornings", "Nia")
        self.assertTrue(all(c["ok"] for c in ok))
        bad = strategy.hook_checks("I Finally Get It. Really.", "Day 12 of 90", "Nia")
        self.assertEqual([c["ok"] for c in bad], [False, False, False])
        until = strategy.hook_checks("day 3 until i run a 5k", "Day 3: running", "Nia")
        self.assertEqual(until[-1], {"label": "uses the “until” format", "ok": True})

    def test_generate_and_approve(self):
        self.bullseye()
        sk = strategy.build_skeletons(strategy._QuietJob(), "@blkgrlco")["skeletons"][0]
        pid = registry.add_ideas("sunday reset", "@blkgrlco", "long-form")["added"][0]
        r = strategy.generate_hooks("@blkgrlco", sk["id"], pid)
        self.assertEqual(len(r["hooks"]), 2)
        self.assertTrue(all(c["ok"] for c in r["hooks"][0]["checks"]))
        self.assertFalse(r["hooks"][1]["checks"][0]["ok"])  # two sentences flagged
        self.assertIn("Oct 21", r["notes"][0])               # rules missing: said so, not invented
        strategy.save_rules({"oct21": "RULE-XYZ"})
        strategy.generate_hooks("@blkgrlco", sk["id"], pid)
        self.assertIn("RULE-XYZ", self.claude.prompts[-1][1])
        plan = strategy.approve_hook(pid, r["hooks"][0]["hook"], sk["pattern"], r["hooks"][0]["title"])
        self.assertEqual(plan["hooks"][0]["text"], "i stopped doing sunday resets and nothing broke")
        self.assertIn("I Quit Sunday Resets", [t["text"] for t in plan["titles"]])
        exp = json.loads((self.tmp / "export.json").read_text())
        self.assertEqual(exp["projects"][0]["hooks"], ["i stopped doing sunday resets and nothing broke"])


def own_uploads(cid, limit=50, prefer=None):
    return [{"id": f"own{i:08d}", "channel_id": cid, "title": f"my video {i}", "views": 100 + i * 10,
             "published": iso(5 * i + 1), "duration": 90 if i % 2 else 600, "description": "", "thumbnail": None}
            for i in range(10)]


def own_retention(cid, vid, start, end):
    i = int(vid[3:])
    return [[k / 100, 1 - k / 100 * (0.5 + i * 0.02), 0.5] for k in range(101)]


class TestAudit(Base):
    def setUp(self):
        super().setUp()
        self.patches += [mock.patch.object(youtube, "channel_uploads", own_uploads),
                         mock.patch.object(youtube, "retention", own_retention)]
        self.patches[-2].start()
        self.patches[-1].start()

    def test_audit_compares_groups_and_proves_patterns_with_her_videos(self):
        pid = registry.add_ideas("video zero")["added"][0]
        plan = registry.get(pid)
        plan["edit"] = {"video_id": "own00000009", "order": [{"fid": "a", "name": "a", "category": "talking-head", "seconds": 500},
                                                             {"fid": "b", "name": "b", "category": "b-roll", "seconds": 100}]}
        registry.save(plan)
        r = strategy.run_audit(strategy._QuietJob(), "UCown0000000000000000000", TODAY)
        self.assertEqual(len(r["videos"]), 10)
        groups = {v["id"]: v["group"] for v in r["videos"]}
        self.assertEqual(groups["own00000009"], "above")
        self.assertEqual(groups["own00000000"], "below")
        v9 = next(v for v in r["videos"] if v["id"] == "own00000009")
        self.assertEqual((v9["format"], v9["format_source"]), ("talking head", "your clip list"))
        self.assertIsNotNone(v9["hold_30s"])
        self.assertEqual([p["name"] for p in r["patterns"]], ["resets win"])
        self.assertEqual(len(r["patterns"][0]["proof"]), 2)
        self.assertTrue(all(p["group"] == "above" for p in r["patterns"][0]["proof"]))
        self.assertIn("topic", r["compare"])
        self.assertEqual(strategy.audit("UCown0000000000000000000")["median_views"], r["median_views"])

    def test_sunday_schedule_and_catch_up(self):
        with mock.patch.object(strategy.vision, "available", return_value=True):
            sat = dt.datetime(2026, 10, 24, 20)  # Saturday: last Sunday slot was Oct 18
            self.assertEqual(strategy.run_sunday_audit_if_due(sat), ["@blkgrlco"])
            self.assertIsNone(strategy.run_sunday_audit_if_due(sat))
            sun_early = dt.datetime(2026, 10, 25, 10)
            self.assertIsNone(strategy.run_sunday_audit_if_due(sun_early))  # before the weekly long-form posts
            tue = dt.datetime(2026, 10, 27, 9)  # Mac was off on Sunday evening: catches up
            self.assertEqual(strategy.run_sunday_audit_if_due(tue), ["@blkgrlco"])

    def test_skeleton_check_against_3s_hold(self):
        with mock.patch.object(youtube, "channel_uploads", fake_uploads):
            self.bullseye()
        strategy.build_skeletons(strategy._QuietJob(), "@blkgrlco")
        with mock.patch.object(youtube, "channel_uploads", own_uploads):
            r = strategy.skeleton_check(strategy._QuietJob(), "@blkgrlco", "UCown0000000000000000000", 5, TODAY)
        self.assertEqual(len(r["rows"]), 5)
        self.assertTrue(any(row["exact"] for row in r["rows"]))      # 90s videos: steps under 3s
        self.assertTrue(any(not row["exact"] for row in r["rows"]))  # 10-min videos: approximate
        self.assertEqual(strategy.spearman([1, 2, 3], [3, 2, 1]), -1.0)


class TestStrategyRoutes(Base):
    def setUp(self):
        super().setUp()
        project_mod._projects.clear()
        server._current.update(project=None, plan_id=None)
        self.httpd = server.serve(port=0)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        super().tearDown()

    def post(self, path, body=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=json.dumps(body or {}).encode(),
                                     method="POST", headers={"X-Bin": "1", "Content-Type": "application/json"})
        with urllib.request.urlopen(req) as r:
            return json.load(r)

    def get(self, path):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}") as r:
            return json.load(r)

    def test_strategy_page_and_guarded_profile_save(self):
        s = self.get("/api/strategy?channel=@blkgrlco")
        self.assertEqual(s["persona"], "Nia")
        self.assertEqual(s["profiles"]["nia"]["missing"], ["goals", "tried", "where_watch"])
        self.assertEqual(s["own_channel"]["id"], "UCown0000000000000000000")
        self.assertTrue(self.post("/api/strategy/profile", {"key": "nia", "changes": {"goals": "a"}})["saved"])
        r = self.post("/api/strategy/profile", {"key": "nia", "changes": {"goals": "b"}})
        self.assertTrue(r["needs_confirm"])
        r = self.post("/api/strategy/profile", {"key": "nia", "changes": {"goals": "b"}, "confirm": True})
        self.assertEqual(r["profiles"]["nia"]["goals"], "b")

    def test_bullseye_job_through_http(self):
        strategy.save_profile("nia", {"lanes": "sunday reset"})
        j = self.post("/api/strategy/bullseye", {"channel": "@blkgrlco"})
        for _ in range(200):
            j = self.get(f"/api/job?id={j['id']}")
            if j["state"] != "running":
                break
            threading.Event().wait(0.05)
        self.assertEqual(j["state"], "done", j["error"])
        self.assertTrue(self.get("/api/strategy?channel=@blkgrlco")["bullseye"]["topics"])

    def test_unknown_job_404(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.get("/api/job?id=nope")
        self.assertEqual(ctx.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
