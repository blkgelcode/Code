"""Local web server on 127.0.0.1 only. Standard library, no framework."""
from __future__ import annotations

import base64
import json
import logging
import mimetypes
import re
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from . import (__version__, flubs, ingest, jobs, lut, picker, planning, project as project_mod, proxy, registry,
               retention, scheduler, settings, speech, strategy, submit, vision, youtube)

log = logging.getLogger("blkbin.server")
WEB = Path(__file__).resolve().parent.parent / "web"
PORT = 4321

_current: dict = {"project": None, "plan_id": None}
_lock = threading.Lock()


class HttpError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def current():
    proj = _current["project"]
    if proj is None:
        raise HttpError(409, "Pick a project folder first.")
    return proj


def current_plan_id() -> str:
    pid = _current["plan_id"]
    if not pid:
        raise HttpError(409, "Pick a project first.")
    return pid


def media_for_plan(plan: dict):
    proj = _current["project"]
    if proj is not None and plan.get("folder") == str(proj.root):
        return proj
    return None


# ---- routes ----------------------------------------------------------------------

def r_status(_body):
    return {
        "version": __version__,
        "project": str(_current["project"].root) if _current["project"] else None,
        "plan_id": _current["plan_id"],
        "claude": vision.available(),
        "api_key_set": settings.has_api_key(),
        "whisper": speech.whisper_available(),
        "native_picker": picker.available(),
    }


def r_get_settings(_body):
    data = settings.load()
    data["api_key_set"] = settings.has_api_key()
    data["palette"] = settings.PALETTE
    data["name_formats"] = settings.NAME_FORMATS
    return data


def r_save_settings(body):
    try:
        return settings.save(body)
    except ValueError as exc:
        raise HttpError(400, str(exc))


def r_api_key(body):
    settings.set_api_key(str(body.get("key", "")))
    return {"api_key_set": settings.has_api_key(), "claude": vision.available()}


def r_pick(_body):
    cfg = settings.load()
    path = picker.choose_folder(cfg.get("default_picker_location"))
    if not path:
        return {"cancelled": True}
    return r_open({"path": path})


def r_open(body):
    try:
        proj = project_mod.open_project(str(body.get("path", "")))
    except project_mod.ProjectError as exc:
        raise HttpError(400, str(exc))
    _current["project"] = proj
    _current["plan_id"] = registry.for_folder(proj.root)["id"]
    return proj.view()


def r_project(_body):
    return current().view()


def r_refresh(_body):
    proj = current()
    proj.refresh()
    return proj.view()


def r_analyze(body):
    proj = current()
    fids = body.get("fids")
    n = proj.queue(fids if fids else None, force=bool(body.get("force")))
    return {"queued": n}


def r_update_file(body):
    proj = current()
    try:
        proj.update(str(body["fid"]), body.get("changes", {}))
    except project_mod.ProjectError as exc:
        raise HttpError(400, str(exc))
    return proj.view()


def r_submit_plan(_body):
    return submit.plan(current())


def r_apply(body):
    try:
        result = submit.apply(current(), str(body.get("plan_id", "")))
    except submit.SubmitError as exc:
        raise HttpError(409, str(exc))
    result["view"] = current().view()
    return result


def r_undo(_body):
    try:
        result = submit.undo(current())
    except submit.SubmitError as exc:
        raise HttpError(409, str(exc))
    result["view"] = current().view()
    return result


# ---- plan tab ------------------------------------------------------------------

def plan_view(plan: dict | None = None) -> dict:
    plan = plan or registry.get(current_plan_id())
    music = planning.music_files(media_for_plan(plan))
    proj = media_for_plan(plan)
    clips = [{"fid": c["fid"], "name": c["name"], "category": c["category"], "category_name": c["category_name"],
              "color": c["color"], "seconds": c["seconds"], "kind": c["kind"]}
             for c in (proj.view()["cards"] if proj else []) if c["kind"] in ("video", "photo") and c["status"] != "error"]
    return {
        "plan": plan,
        "clips": clips,
        "media_open": proj is not None,
        "youtube_connected": bool(youtube.channels()),
        "check": registry.title_check(plan),
        "music": music,
        "cues": planning.cues(plan.get("script", ""), music),
        "channels": registry.CHANNELS,
        "formats": registry.FORMATS,
        "long_formats": sorted(registry.LONG_FORMATS),
        "statuses": registry.STATUSES,
        "export_path": str(registry.export_path()),
        "claude": vision.available(),
    }


def _plan_call(fn, *args):
    try:
        return plan_view(fn(current_plan_id(), *args))
    except (KeyError, ValueError) as exc:
        raise HttpError(400, str(exc).strip("'") or "Not found")


def r_plan(_body):
    return plan_view()


def r_plan_details(body):
    return _plan_call(registry.update_details, body.get("changes", {}))


def r_titles_add(body):
    return _plan_call(registry.add_titles, str(body.get("text", "")))


def r_titles_update(body):
    return _plan_call(registry.update_title, str(body.get("id", "")), body.get("changes", {}))


def r_thumbs_upload(body):
    try:
        data = base64.b64decode(str(body.get("data", "")).split(",")[-1], validate=True)
    except ValueError:
        raise HttpError(400, "That upload didn't come through. Try again.")
    return _plan_call(planning.add_thumbnail, str(body.get("name", "thumbnail.png")), data)


def r_thumbs_score(body):
    return _plan_call(planning.score_all, body.get("ids"))


def r_thumbs_update(body):
    return _plan_call(planning.update_thumbnail, str(body.get("id", "")), body.get("changes", {}))


def r_thumbs_remove(body):
    return _plan_call(planning.remove_thumbnail, str(body.get("id", "")))


def r_script(body):
    return _plan_call(planning.set_script, str(body.get("text", "")))


def r_export(_body):
    return registry.build_export()


# ---- overview tab: projects, ideas, YouTube ------------------------------------------------

def r_projects(_body):
    plans = [registry.summary(p) for p in registry.all_plans()]
    return {"projects": plans, "current": _current["plan_id"], "formats": registry.FORMATS,
            "channels": registry.CHANNELS, "statuses": registry.STATUSES}


def _open_media(folder: str | None):
    """Open a plan's T7 folder in the Media tab, or clear it if there isn't one (yet)."""
    if folder and Path(folder).is_dir():
        try:
            _current["project"] = project_mod.open_project(folder)
            return
        except project_mod.ProjectError:
            pass
    _current["project"] = None


def r_select(body):
    try:
        plan = registry.get(str(body.get("id", "")))
    except KeyError:
        raise HttpError(404, "That project isn't here anymore.")
    _current["plan_id"] = plan["id"]
    _open_media(plan.get("folder"))
    return {**r_projects({}), "media_open": _current["project"] is not None}


def r_link_folder(body):
    pid = current_plan_id()
    path = body.get("path")
    if not path:
        path = picker.choose_folder(settings.load().get("default_picker_location"))
        if not path:
            return {"cancelled": True}
    folder = Path(path).expanduser().resolve()
    try:
        project_mod.check_folder(folder)
        registry.link_folder(pid, folder)
    except (project_mod.ProjectError, ValueError) as exc:
        raise HttpError(400, str(exc))
    _open_media(str(folder))
    return {**r_projects({}), "media_open": _current["project"] is not None}


def r_ideas_add(body):
    try:
        r = registry.add_ideas(str(body.get("text", "")), body.get("channel", "@blkgrlco"),
                               body.get("format", "long-form"))
    except ValueError as exc:
        raise HttpError(400, str(exc))
    return {**r, **r_projects({})}


def r_ideas_screenshot(body):
    raw = str(body.get("data", ""))
    media_type = "image/png"
    if raw.startswith("data:"):
        media_type = raw[5:raw.index(";")] if ";" in raw else media_type
    if media_type not in ("image/png", "image/jpeg", "image/webp", "image/gif"):
        raise HttpError(400, "Use a PNG or JPG screenshot.")
    try:
        data = base64.b64decode(raw.split(",")[-1], validate=True)
        return {"ideas": vision.extract_ideas(data, media_type, settings.load())}
    except ValueError:
        raise HttpError(400, "That upload didn't come through. Try again.")
    except RuntimeError as exc:
        raise HttpError(409, str(exc))


def _yt(fn, *args):
    try:
        return fn(*args)
    except youtube.YouTubeError as exc:
        raise HttpError(409, str(exc))


def r_yt_status(_body):
    return youtube.status()


def r_yt_client(body):
    return _yt(youtube.save_client, str(body.get("json", "")))


def r_yt_disconnect(body):
    return youtube.disconnect(str(body.get("id", "")))


def r_yt_overview(query):
    try:
        days = int((query.get("days") or ["28"])[0])
    except ValueError:
        days = 28
    return _yt(youtube.overview, (query.get("channel") or [""])[0], days)


# ---- Phase 4: ingest, fix + proxy, LUT, flub map, retention -----------------------------------------

def _job_start(kind, fn, *args):
    try:
        return jobs.start(kind, fn, *args)
    except jobs.JobError as exc:
        raise HttpError(409, str(exc))


def r_job(query):
    try:
        return jobs.snapshot((query.get("id") or [""])[0])
    except KeyError:
        raise HttpError(404, "No such job (the app may have restarted).")


def r_ingest_sources(_body):
    cfg = settings.load()
    root = cfg["default_picker_location"]
    return {"sources": ingest.sources(), "dest_root": root, "dest_ok": Path(root).is_dir(),
            "running": jobs.latest("ingest")}


def r_ingest_pick(_body):
    path = picker.choose_folder(None)
    if not path:
        return {"cancelled": True}
    return {"source": ingest.describe(Path(path))}


def r_ingest_plan(body):
    try:
        return ingest.plan(str(body.get("src", "")), str(body.get("name", "")))
    except ingest.IngestError as exc:
        raise HttpError(400, str(exc))


def r_ingest_start(body):
    r_ingest_plan(body)  # same checks, answered right away
    return _job_start("ingest", ingest.run, str(body["src"]), str(body["name"]))


def r_lut_status(_body):
    return lut.status()


def r_lut_install(body):
    try:
        return lut.install(str(body.get("text", "")), str(body.get("name", "")))
    except lut.LutError as exc:
        raise HttpError(400, str(exc))


def r_proxy_todo(_body):
    return proxy.todo(current())


def r_proxy_start(body):
    return _job_start("proxy", proxy.run, current(), bool(body.get("fix", True)), bool(body.get("proxy", True)))


def r_flubs_start(body):
    proj = current()
    if not flubs.candidates(proj):
        raise HttpError(409, "No analyzed clips with talking in this project.")
    return _job_start("flubs", flubs.run, proj, body.get("fids") or None)


def r_flub_map(query):
    e = current().state["files"].get((query.get("fid") or [""])[0])
    if not e or not e.get("flubmap"):
        raise HttpError(404, "No flub map for that clip yet.")
    return {"name": Path(e["path"]).name, "map": e["flubmap"]}


def r_edit_order(body):
    return _plan_call(lambda pid: retention.reanalyze(retention.set_edit_order(pid, body.get("items") or [],
                                                                               media_for_plan(registry.get(pid)))["id"]))


def r_link_video(body):
    try:
        return _plan_call(retention.link_video, str(body.get("url", "")))
    except youtube.YouTubeError as exc:
        raise HttpError(409, str(exc))


def r_unlink_video(_body):
    return _plan_call(retention.unlink_video)


def r_retention_pull(body):
    label = body.get("label") if body.get("label") in retention.PULLS else "now"
    try:
        return _plan_call(retention.pull, label)
    except youtube.YouTubeError as exc:
        raise HttpError(409, str(exc))


def r_loses_viewers(_body):
    return retention.loses_viewers()


# ---- Phase 5: strategy -----------------------------------------------------------------------------------

def _st(fn, *args):
    try:
        return fn(*args)
    except strategy.StrategyError as exc:
        raise HttpError(409, str(exc))
    except youtube.YouTubeError as exc:
        raise HttpError(409, str(exc))


def r_strategy(query):
    ch = (query.get("channel") or ["@blkgrlco"])[0]
    if ch not in strategy.AUDIENCE:
        raise HttpError(400, "Unknown channel.")
    yt = youtube.status()
    own = next((c for c in yt["channels"] if (c.get("handle") or "").lower() == ch.lower()), None)
    return {"channel": ch, "persona": strategy.PERSONA[strategy.AUDIENCE[ch]], "profiles": strategy.profiles(),
            "profile_fields": strategy.PROFILE_FIELDS, "rules": strategy.rules(), "rule_fields": strategy.RULE_FIELDS,
            "bullseye": strategy.bullseye(ch), "skeletons": strategy.skeletons(ch),
            "audit": strategy.audit(own["id"]) if own else None, "own_channel": own,
            "youtube": yt, "claude": vision.available(), "openings": len(strategy.openings()),
            "jobs": {k: jobs.latest(k) for k in ("bullseye", "skeletons", "audit", "skcheck")},
            "plans": [registry.summary(p) for p in registry.all_plans() if p["details"]["status"] != "posted"],
            "formats": registry.FORMATS, "channels": registry.CHANNELS}


def r_profile_save(body):
    return _st(strategy.save_profile, str(body.get("key", "")), body.get("changes") or {}, bool(body.get("confirm")))


def r_rules_save(body):
    return _st(strategy.save_rules, body.get("changes") or {}, bool(body.get("confirm")))


def _own_channel(ch: str) -> str:
    for c in youtube.status()["channels"]:
        if (c.get("handle") or "").lower() == ch.lower():
            return c["id"]
    raise HttpError(409, f"Connect {ch} in Settings → Connections first.")


def r_bullseye_run(body):
    ch = str(body.get("channel", "@blkgrlco"))
    if not youtube.channels():
        raise HttpError(409, "Connect a YouTube channel first (Settings → Connections).")
    return _job_start("bullseye", strategy.run_bullseye, ch)


def r_send_topic(body):
    r = _st(strategy.send_topic, str(body.get("channel", "")), str(body.get("id", "")), str(body.get("format", "long-form")))
    return {**r, **r_projects({})}


def r_skeletons_run(body):
    return _job_start("skeletons", strategy.build_skeletons, str(body.get("channel", "@blkgrlco")))


def r_openings(body):
    return _st(strategy.set_openings, str(body.get("text", "")))


def r_hooks_generate(body):
    return _st(strategy.generate_hooks, str(body.get("channel", "")), str(body.get("skeleton", "")), str(body.get("pid", "")))


def r_hooks_approve(body):
    try:
        plan = strategy.approve_hook(str(body.get("pid", "")), str(body.get("text", "")), str(body.get("skeleton", "")),
                                     str(body.get("title", "")))
    except (KeyError, strategy.StrategyError) as exc:
        raise HttpError(400, str(exc))
    return {"ok": True, "hooks": plan.get("hooks", [])}


def r_hooks_remove(body):
    return _plan_call(strategy.remove_hook, str(body.get("id", "")))


def r_audit_run(body):
    ch = str(body.get("channel", "@blkgrlco"))
    return _job_start("audit", strategy.run_audit, _own_channel(ch))


def r_skcheck_run(body):
    ch = str(body.get("channel", "@blkgrlco"))
    return _job_start("skcheck", strategy.skeleton_check, ch, _own_channel(ch), int(body.get("count") or 5))


GET_ROUTES = {
    "/api/status": r_status,
    "/api/settings": r_get_settings,
    "/api/project": r_project,
    "/api/plan": r_plan,
    "/api/export.json": r_export,
    "/api/projects": r_projects,
    "/api/youtube/status": r_yt_status,
    "/api/ingest/sources": r_ingest_sources,
    "/api/lut": r_lut_status,
    "/api/proxy/todo": r_proxy_todo,
    "/api/retention/table": r_loses_viewers,
}
QUERY_ROUTES = {"/api/youtube/overview": r_yt_overview, "/api/job": r_job, "/api/flubs/map": r_flub_map,
                "/api/strategy": r_strategy}
POST_ROUTES = {
    "/api/settings": r_save_settings,
    "/api/api-key": r_api_key,
    "/api/project/pick": r_pick,
    "/api/project/open": r_open,
    "/api/project/refresh": r_refresh,
    "/api/analyze": r_analyze,
    "/api/file": r_update_file,
    "/api/submit/plan": r_submit_plan,
    "/api/submit/apply": r_apply,
    "/api/submit/undo": r_undo,
    "/api/plan/details": r_plan_details,
    "/api/plan/titles/add": r_titles_add,
    "/api/plan/titles/update": r_titles_update,
    "/api/plan/thumbs/upload": r_thumbs_upload,
    "/api/plan/thumbs/score": r_thumbs_score,
    "/api/plan/thumbs/update": r_thumbs_update,
    "/api/plan/thumbs/remove": r_thumbs_remove,
    "/api/plan/script": r_script,
    "/api/projects/select": r_select,
    "/api/projects/link-folder": r_link_folder,
    "/api/ideas/add": r_ideas_add,
    "/api/ideas/screenshot": r_ideas_screenshot,
    "/api/youtube/client": r_yt_client,
    "/api/youtube/disconnect": r_yt_disconnect,
    "/api/ingest/pick": r_ingest_pick,
    "/api/ingest/plan": r_ingest_plan,
    "/api/ingest/start": r_ingest_start,
    "/api/lut": r_lut_install,
    "/api/proxy/start": r_proxy_start,
    "/api/flubs/start": r_flubs_start,
    "/api/plan/edit-order": r_edit_order,
    "/api/plan/video": r_link_video,
    "/api/plan/video/unlink": r_unlink_video,
    "/api/plan/retention/pull": r_retention_pull,
    "/api/plan/hooks/remove": r_hooks_remove,
    "/api/strategy/profile": r_profile_save,
    "/api/strategy/rules": r_rules_save,
    "/api/strategy/bullseye": r_bullseye_run,
    "/api/strategy/send-topic": r_send_topic,
    "/api/strategy/skeletons": r_skeletons_run,
    "/api/strategy/openings": r_openings,
    "/api/strategy/hooks": r_hooks_generate,
    "/api/strategy/hooks/approve": r_hooks_approve,
    "/api/strategy/audit": r_audit_run,
    "/api/strategy/skeleton-check": r_skcheck_run,
}

FRAME_RE = re.compile(r"^/api/frame/([0-9a-f]{16}(?:~\d+)?_\d)\.(jpg|png)$")
THUMB_RE = re.compile(r"^/api/thumb/(p-[0-9a-f]{8})/(th-[0-9a-f]{6}(?:\.cb|\.phone)?\.(?:png|jpg|webp))$")


class Handler(BaseHTTPRequestHandler):
    server_version = "BLKGRLCO-Bin"

    def log_message(self, fmt, *args):
        log.debug(fmt, *args)

    # Only answer requests addressed to this machine (blocks DNS-rebinding tricks).
    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").split(":")[0]
        return host in ("127.0.0.1", "localhost")

    def _send(self, status: int, body: bytes, ctype: str, extra: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, data):
        self._send(status, json.dumps(data).encode(), "application/json")

    def do_GET(self):
        if not self._host_ok():
            return self._json(403, {"error": "forbidden"})
        url = urlparse(self.path)
        path = unquote(url.path)
        try:
            if path in GET_ROUTES:
                return self._json(200, GET_ROUTES[path]({}))
            if path in QUERY_ROUTES:
                return self._json(200, QUERY_ROUTES[path](parse_qs(url.query)))
            if path == "/api/youtube/connect":
                port = self.server.server_address[1]
                target = _yt(youtube.auth_url, f"http://127.0.0.1:{port}/oauth/callback")
                return self._send(302, b"", "text/plain", {"Location": target})
            if path == "/oauth/callback":
                return self._oauth_callback(parse_qs(url.query))
            m = FRAME_RE.match(path)
            if m:
                return self._frame(m.group(1) + "." + m.group(2))
            m = THUMB_RE.match(path)
            if m:
                return self._thumb(m.group(1), m.group(2))
            return self._static(path)
        except HttpError as exc:
            return self._json(exc.status, {"error": str(exc)})
        except Exception as exc:
            log.error("GET %s failed: %s", path, traceback.format_exc())
            return self._json(500, {"error": str(exc)})

    def do_POST(self):
        if not self._host_ok():
            return self._json(403, {"error": "forbidden"})
        # A custom header can't be sent cross-site without a CORS preflight,
        # which this server never approves: other websites can't drive the app.
        if self.headers.get("X-Bin") != "1":
            return self._json(403, {"error": "missing X-Bin header"})
        path = urlparse(self.path).path
        route = POST_ROUTES.get(path)
        if not route:
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}") if length else {}
            serial = _lock if path.startswith("/api/submit") else \
                registry.lock() if (path.startswith("/api/plan") and path not in ("/api/plan/thumbs/score", "/api/plan/video",
                                                                                 "/api/plan/retention/pull")) \
                or path in ("/api/ideas/add", "/api/projects/link-folder", "/api/strategy/hooks/approve",
                            "/api/strategy/send-topic") else _NoLock()
            with serial:
                return self._json(200, route(body))
        except HttpError as exc:
            return self._json(exc.status, {"error": str(exc)})
        except Exception as exc:
            log.error("POST %s failed: %s", path, traceback.format_exc())
            return self._json(500, {"error": str(exc)})

    def _oauth_callback(self, q: dict):
        """Google sends the browser back here after sign-in. The state check ties it to a
        sign-in this app started, so another site can't plant a channel."""
        if q.get("error"):
            msg, ok = f"Google sign-in was cancelled ({q['error'][0]}).", False
        else:
            try:
                ch = youtube.finish_auth((q.get("state") or [""])[0], (q.get("code") or [""])[0])
                msg, ok = f"Connected {ch['title']}.", True
            except youtube.YouTubeError as exc:
                msg, ok = str(exc), False
        import html
        page = (f"<!doctype html><meta charset=utf-8><title>BLKGRLCO Bin</title>"
                f"<body style=\"font-family:Poppins,system-ui,sans-serif;background:#F0DAC2;color:#2E1500;"
                f"display:grid;place-items:center;height:100vh;margin:0\"><div style=\"text-align:center\">"
                f"<h2>{'✓ ' if ok else ''}{html.escape(msg)}</h2><p>You can close this tab and go back to BLKGRLCO Bin.</p>"
                f"</div></body>")
        self._send(200 if ok else 400, page.encode(), "text/html; charset=utf-8")

    def _frame(self, name: str):
        proj = current()
        p = proj.state_dir / "frames" / name
        if not p.is_file():
            raise HttpError(404, "no frame")
        ctype = "image/png" if name.endswith(".png") else "image/jpeg"
        self._send(200, p.read_bytes(), ctype)

    def _thumb(self, pid: str, name: str):
        p = registry.project_dir(pid) / "thumbs" / name
        if not p.is_file():
            raise HttpError(404, "no thumbnail")
        ctype = mimetypes.guess_type(name)[0] or "image/png"
        self._send(200, p.read_bytes(), ctype)

    def _static(self, path: str):
        if path in ("", "/"):
            path = "/index.html"
        target = (WEB / path.lstrip("/")).resolve()
        if WEB not in target.parents or not target.is_file():
            raise HttpError(404, "not found")
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self._send(200, target.read_bytes(), ctype)


class _NoLock:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def serve(port: int = PORT, open_path: str | None = None) -> ThreadingHTTPServer:
    settings.load_env()
    if open_path:
        r_open({"path": open_path})
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    return httpd
