"""Local web server on 127.0.0.1 only. Standard library, no framework."""
from __future__ import annotations

import json
import logging
import mimetypes
import re
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from . import __version__, picker, project as project_mod, settings, speech, submit, vision

log = logging.getLogger("blkbin.server")
WEB = Path(__file__).resolve().parent.parent / "web"
PORT = 4321

_current: dict = {"project": None}
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


# ---- routes ----------------------------------------------------------------------

def r_status(_body):
    return {
        "version": __version__,
        "project": str(_current["project"].root) if _current["project"] else None,
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


def r_plan(_body):
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


GET_ROUTES = {
    "/api/status": r_status,
    "/api/settings": r_get_settings,
    "/api/project": r_project,
}
POST_ROUTES = {
    "/api/settings": r_save_settings,
    "/api/api-key": r_api_key,
    "/api/project/pick": r_pick,
    "/api/project/open": r_open,
    "/api/project/refresh": r_refresh,
    "/api/analyze": r_analyze,
    "/api/file": r_update_file,
    "/api/submit/plan": r_plan,
    "/api/submit/apply": r_apply,
    "/api/submit/undo": r_undo,
}

FRAME_RE = re.compile(r"^/api/frame/([0-9a-f]{16}(?:~\d+)?_\d)\.(jpg|png)$")


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
        path = unquote(urlparse(self.path).path)
        try:
            if path in GET_ROUTES:
                return self._json(200, GET_ROUTES[path]({}))
            m = FRAME_RE.match(path)
            if m:
                return self._frame(m.group(1) + "." + m.group(2))
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
            with _lock if path.startswith("/api/submit") else _NoLock():
                return self._json(200, route(body))
        except HttpError as exc:
            return self._json(exc.status, {"error": str(exc)})
        except Exception as exc:
            log.error("POST %s failed: %s", path, traceback.format_exc())
            return self._json(500, {"error": str(exc)})

    def _frame(self, name: str):
        proj = current()
        p = proj.state_dir / "frames" / name
        if not p.is_file():
            raise HttpError(404, "no frame")
        ctype = "image/png" if name.endswith(".png") else "image/jpeg"
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
