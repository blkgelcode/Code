"""Phase 3 (Overview) tests. Run with:  python3 -m unittest discover -s tests"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import make_fixtures  # noqa: E402
from blkbin import project as project_mod, registry, server, settings, youtube  # noqa: E402


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="blkbin-ov-"))
        os.environ["BLKBIN_HOME"] = str(self.tmp / "home")
        os.environ.pop("ANTHROPIC_API_KEY", None)
        settings.save({"export_path": str(self.tmp / "export.json")})
        youtube._cache.clear()


class TestIdeas(Base):
    def test_one_project_per_line_and_no_duplicates(self):
        r = registry.add_ideas("1. why i quit coffee\n- my sunday reset\n\nwhy I quit coffee", "@blkgrlcotoo", "long-form")
        self.assertEqual(len(r["added"]), 2)
        self.assertEqual(r["skipped"], ["why I quit coffee"])
        plans = {p["details"]["name"]: p for p in registry.all_plans()}
        self.assertEqual(plans["my sunday reset"]["details"]["status"], "not-started")
        self.assertEqual(plans["my sunday reset"]["details"]["channel"], "@blkgrlcotoo")
        self.assertIsNone(plans["my sunday reset"]["folder"])
        exp = json.loads(Path(registry.export_path()).read_text())
        self.assertEqual({p["source"] for p in exp["projects"]}, {"idea"})

    def test_rejects_unknown_channel(self):
        with self.assertRaises(ValueError):
            registry.add_ideas("x", "@nope")

    def test_link_folder_to_idea(self):
        pid = registry.add_ideas("desk vlog")["added"][0]
        folder = self.tmp / "desk vlog"
        folder.mkdir()
        registry.link_folder(pid, folder)
        self.assertEqual(registry.get(pid)["folder"], str(folder))
        self.assertEqual(registry.for_folder(folder)["id"], pid)  # opening it later finds the same plan
        other = registry.add_ideas("another idea")["added"][0]
        with self.assertRaises(ValueError):
            registry.link_folder(other, folder)  # already belongs to "desk vlog"


class FakeGoogle:
    """Answers the handful of Google endpoints the app calls."""

    def __init__(self, monetized=True):
        self.monetized = monetized
        self.calls = []

    def __call__(self, method, url, data=None, headers=None):
        self.calls.append((method, url, data))
        if url == youtube.TOKEN_URL:
            if data["grant_type"] == "authorization_code":
                return {"access_token": "at1", "expires_in": 3600, "refresh_token": "rt1", "scope": " ".join(youtube.SCOPES)}
            return {"access_token": "at2", "expires_in": 3600}
        if url.startswith(youtube.DATA_API + "/channels"):
            return {"items": [{"id": "UC123", "snippet": {"title": "BLKGRLCO", "customUrl": "@blkgrlco"},
                               "statistics": {"subscriberCount": "1234", "hiddenSubscriberCount": False}}]}
        if url.startswith(youtube.ANALYTICS_API):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
            start = dt.date.fromisoformat(q["startDate"][0])
            end = dt.date.fromisoformat(q["endDate"][0])
            days = [(start + dt.timedelta(days=i)) for i in range((end - start).days + 1)]
            if q["metrics"][0] == "estimatedRevenue":
                if not self.monetized:
                    raise youtube.YouTubeError("YouTube said 403: Forbidden")
                return {"columnHeaders": [{"name": "day"}, {"name": "estimatedRevenue"}],
                        "rows": [[d.isoformat(), 1.5] for d in days]}
            # first half of the range = previous period: 100 views/day; second half: 150 views/day
            half = len(days) // 2
            return {"columnHeaders": [{"name": n} for n in ("day", "views", "estimatedMinutesWatched", "subscribersGained", "subscribersLost")],
                    "rows": [[d.isoformat(), 100 if i < half else 150, 600, 3, 1] for i, d in enumerate(days)]}
        raise AssertionError("unexpected call " + url)


class TestYouTube(Base):
    def connect(self, fake):
        youtube.save_client(json.dumps({"installed": {"client_id": "cid", "client_secret": "sec"}}))
        url = youtube.auth_url("http://127.0.0.1:4321/oauth/callback")
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        self.assertEqual(q["code_challenge_method"], ["S256"])
        self.assertIn("yt-analytics.readonly", q["scope"][0])
        with mock.patch.object(youtube, "_http", fake):
            return youtube.finish_auth(q["state"][0], "the-code")

    def test_connect_and_28_day_overview(self):
        fake = FakeGoogle()
        self.assertEqual(self.connect(fake)["title"], "BLKGRLCO")
        self.assertEqual(youtube.status()["channels"][0]["handle"], "@blkgrlco")
        with mock.patch.object(youtube, "_http", fake):
            o = youtube.overview("UC123", 28, today=dt.date(2026, 10, 26))
        self.assertEqual(o["end"], "2026-10-23")      # 3 days of reporting lag
        self.assertEqual(o["start"], "2026-09-26")
        self.assertEqual(len(o["dates"]), 28)
        v = o["metrics"]["views"]
        self.assertEqual((v["total"], v["previous_total"], v["change"]), (150 * 28, 100 * 28, 0.5))
        self.assertEqual(o["metrics"]["watch_hours"]["total"], 280.0)
        self.assertEqual(o["metrics"]["subscribers"]["total"], 56)
        self.assertEqual(o["metrics"]["subscribers"]["current_total"], 1234)
        self.assertEqual(o["metrics"]["earnings"]["total"], 42.0)

    def test_earnings_not_available_without_monetization(self):
        fake = FakeGoogle(monetized=False)
        self.connect(fake)
        with mock.patch.object(youtube, "_http", fake):
            o = youtube.overview("UC123", 7, today=dt.date(2026, 10, 26))
        self.assertFalse(o["metrics"]["earnings"]["available"])
        self.assertTrue(o["metrics"]["views"]["available"])
        self.assertFalse(youtube.channels()["UC123"]["earnings"])

    def test_refreshes_expired_token(self):
        fake = FakeGoogle()
        self.connect(fake)
        chans = youtube.channels()
        chans["UC123"]["token"]["expires_at"] = 0
        youtube._write_private("channels.json", chans)
        with mock.patch.object(youtube, "_http", fake):
            youtube.overview("UC123", 7, today=dt.date(2026, 10, 26))
        self.assertTrue(any(d and d.get("grant_type") == "refresh_token" for _, _, d in fake.calls))
        self.assertEqual(youtube.channels()["UC123"]["token"]["access_token"], "at2")

    def test_unknown_sign_in_is_refused(self):
        youtube.save_client(json.dumps({"installed": {"client_id": "cid", "client_secret": "sec"}}))
        with self.assertRaises(youtube.YouTubeError):
            youtube.finish_auth("not-a-state-we-made", "code")

    def test_bad_client_file(self):
        with self.assertRaises(youtube.YouTubeError):
            youtube.save_client('{"something": 1}')

    def test_tokens_are_private(self):
        self.connect(FakeGoogle())
        mode = (settings.app_home() / "youtube" / "channels.json").stat().st_mode & 0o777
        self.assertEqual(mode, 0o600)


class TestServerRoutes(Base):
    """Through the real HTTP server, the way the browser calls it."""

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

    def post(self, path, body=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=json.dumps(body or {}).encode(),
                                     method="POST", headers={"X-Bin": "1", "Content-Type": "application/json"})
        with urllib.request.urlopen(req) as r:
            return json.load(r)

    def get(self, path):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}") as r:
            return json.load(r)

    def test_dry_run_route_returns_the_rename_list(self):
        folder = make_fixtures.make(self.tmp / "2026-10-11 desk vlog")
        self.post("/api/project/open", {"path": str(folder)})
        proj = server._current["project"]
        for e in proj.entries():
            proj.analyze(e["fid"])
        plan = self.post("/api/submit/plan")
        self.assertIn("ops", plan)
        self.assertEqual(len(plan["ops"]), 7)

    def test_ideas_then_select_then_link(self):
        r = self.post("/api/ideas/add", {"text": "why i quit coffee\nmy sunday reset", "channel": "@blkgrlco", "format": "long-form"})
        self.assertEqual(len(r["added"]), 2)
        pid = r["added"][0]
        sel = self.post("/api/projects/select", {"id": pid})
        self.assertEqual(sel["current"], pid)
        self.assertFalse(sel["media_open"])
        folder = make_fixtures.make(self.tmp / "coffee")
        linked = self.post("/api/projects/link-folder", {"path": str(folder)})
        self.assertTrue(linked["media_open"])
        self.assertEqual(self.get("/api/plan")["plan"]["folder"], str(folder.resolve()))
        self.assertEqual(len(self.get("/api/project")["cards"]), 7)

    def test_oauth_callback_with_bad_state_shows_error_page(self):
        youtube.save_client(json.dumps({"installed": {"client_id": "cid", "client_secret": "sec"}}))
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(f"http://127.0.0.1:{self.port}/oauth/callback?state=forged&code=x")
        self.assertEqual(ctx.exception.code, 400)
        self.assertEqual(youtube.channels(), {})


if __name__ == "__main__":
    unittest.main()
