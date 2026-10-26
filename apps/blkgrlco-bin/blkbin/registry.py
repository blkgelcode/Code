"""Every video project the app knows about, its plan, and the dashboard export.

A project is one video. It may have a T7 folder (footage) or not yet (an idea).
Plans live on the Mac in <app home>/projects/<id>/plan.json; a folder project
also records its id in <folder>/.blkgrlco-bin/project.json so it's found again.

The export (default ~/BLKGRLCO Studios/bin-export.json) is what the BLKGRLCO
Studios dashboard imports: every project with its details and approved titles.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import secrets
import threading
from pathlib import Path

from . import settings as settings_mod

CHANNELS = {"@blkgrlco": "@blkgrlco", "@blkgrlcotoo": "@blkgrlcotoo", "podcast": "I Wish Someone Had Told Me"}
# Same values the dashboard uses, so imports line up.
FORMATS = ["long-form", "weekly long-form", "update", "episode", "daily short", "short", "test short"]
LONG_FORMATS = {"long-form", "weekly long-form", "update", "episode"}
LIST_MARK = re.compile(r"^\s*(?:[-•*]|\d{1,2}[.)])\s+")
STATUSES = {"not-started": "Not started", "in-progress": "In progress", "posted": "Posted"}

_lock = threading.RLock()


def lock() -> threading.RLock:
    """Hold while reading, changing and saving a plan."""
    return _lock


def _now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def projects_dir() -> Path:
    d = settings_mod.app_home() / "projects"
    d.mkdir(parents=True, exist_ok=True)
    return d


def project_dir(pid: str) -> Path:
    if not pid or not all(c.isalnum() or c == "-" for c in pid):
        raise KeyError(pid)
    return projects_dir() / pid


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1))
    tmp.replace(path)


def new_plan(name: str, folder: str | None = None, **details) -> dict:
    pid = "p-" + secrets.token_hex(4)
    plan = {
        "id": pid,
        "folder": folder,
        "created": _now(),
        "updated": _now(),
        "details": {
            "name": name.strip() or "Untitled video",
            "post_date": "",
            "channel": "@blkgrlco",
            "format": "long-form",
            "status": "not-started",
            **{k: v for k, v in details.items() if v is not None},
        },
        "titles": [],
        "thumbs": [],
        "script": "",
        "source": "folder" if folder else "idea",
    }
    with _lock:
        _write_json(project_dir(pid) / "plan.json", plan)
    write_export()
    return plan


def get(pid: str) -> dict:
    p = project_dir(pid) / "plan.json"
    if not p.exists():
        raise KeyError(pid)
    return json.loads(p.read_text())


def save(plan: dict) -> dict:
    with _lock:
        plan["updated"] = _now()
        _write_json(project_dir(plan["id"]) / "plan.json", plan)
    write_export()
    return plan


def all_plans() -> list[dict]:
    out = []
    for d in sorted(projects_dir().iterdir()):
        f = d / "plan.json"
        if f.exists():
            try:
                out.append(json.loads(f.read_text()))
            except ValueError:
                continue
    return out


def for_folder(folder: Path) -> dict:
    """The plan for a T7 folder, creating it the first time the folder is opened."""
    marker = folder / ".blkgrlco-bin" / "project.json"
    with _lock:
        if marker.exists():
            try:
                pid = json.loads(marker.read_text())["id"]
                plan = get(pid)
                old = plan.get("folder")
                if old == str(folder):
                    return plan
                if not old or not Path(old).is_dir():  # drive renamed or folder moved
                    plan["folder"] = str(folder)
                    return save(plan)
                # the old folder is still there, so this is a copy (e.g. ~/bin-test): its own plan
            except (KeyError, ValueError):
                pass
        for plan in all_plans():  # marker lost, but we know this path
            if plan.get("folder") == str(folder):
                _write_json(marker, {"id": plan["id"]})
                return plan
        plan = new_plan(folder.name, str(folder))
        _write_json(marker, {"id": plan["id"]})
        return plan


def attach_folder(pid: str, folder: Path) -> dict:
    plan = get(pid)
    plan["folder"] = str(folder)
    _write_json(folder / ".blkgrlco-bin" / "project.json", {"id": pid})
    return save(plan)


# ---- details, titles ----------------------------------------------------------

def update_details(pid: str, changes: dict) -> dict:
    plan = get(pid)
    d = plan["details"]
    if "name" in changes:
        d["name"] = str(changes["name"]).strip()[:200] or d["name"]
    if "post_date" in changes:
        v = str(changes["post_date"] or "")
        if v and not _is_date(v):
            raise ValueError("Post date must be YYYY-MM-DD")
        d["post_date"] = v
    if "channel" in changes:
        if changes["channel"] not in CHANNELS:
            raise ValueError("Unknown channel")
        d["channel"] = changes["channel"]
    if "format" in changes:
        if changes["format"] not in FORMATS:
            raise ValueError("Unknown video type")
        d["format"] = changes["format"]
    if "status" in changes:
        if changes["status"] not in STATUSES:
            raise ValueError("Unknown status")
        d["status"] = changes["status"]
    return save(plan)


def _is_date(v: str) -> bool:
    try:
        dt.date.fromisoformat(v)
        return True
    except ValueError:
        return False


def add_titles(pid: str, text: str) -> dict:
    """One title per non-empty line, so a pasted list works."""
    plan = get(pid)
    have = {t["text"].strip().lower() for t in plan["titles"]}
    for line in str(text).splitlines():
        line = LIST_MARK.sub("", line).strip()  # pasted "1. title" / "- title" lists
        if line and line.lower() not in have:
            plan["titles"].append({"id": "t-" + secrets.token_hex(3), "text": line[:200],
                                   "approved": False, "created": _now()})
            have.add(line.lower())
    return save(plan)


def update_title(pid: str, tid: str, changes: dict) -> dict:
    plan = get(pid)
    t = next((t for t in plan["titles"] if t["id"] == tid), None)
    if not t:
        raise KeyError(tid)
    if "text" in changes:
        text = str(changes["text"]).strip()
        if text:
            t["text"] = text
    if "approved" in changes:
        t["approved"] = bool(changes["approved"])
        t["approved_at"] = _now() if t["approved"] else None
    if changes.get("remove"):
        plan["titles"].remove(t)
        for th in plan["thumbs"]:
            if th.get("title_id") == tid:
                th["title_id"] = None
    return save(plan)


def title_check(plan: dict) -> dict:
    fmt = plan["details"]["format"]
    need = 3 if fmt in LONG_FORMATS else 1
    written = len([t for t in plan["titles"] if t["text"].strip()])
    approved = len([t for t in plan["titles"] if t.get("approved")])
    return {"need": need, "written": written, "approved": approved, "ok": written >= need,
            "long_form": fmt in LONG_FORMATS}


# ---- export for the dashboard ---------------------------------------------------

def export_path() -> Path:
    cfg = settings_mod.load()
    p = cfg.get("export_path") or str(Path.home() / "BLKGRLCO Studios" / "bin-export.json")
    return Path(os.path.expanduser(p))


def is_test_copy(folder: str | None) -> bool:
    """Folders under ~/bin-test are test copies; they never go to the dashboard."""
    if not folder:
        return False
    test_root = Path.home() / "bin-test"
    return Path(folder) == test_root or test_root in Path(folder).parents


def build_export() -> dict:
    projects = []
    for plan in all_plans():
        if is_test_copy(plan.get("folder")):
            continue
        d = plan["details"]
        titles = [t for t in plan["titles"] if t.get("approved")]
        by_title = {}
        for th in sorted(plan.get("thumbs", []), key=lambda x: x.get("rank") or 99):
            if th.get("title_id"):
                by_title.setdefault(th["title_id"], []).append(th)
        projects.append({
            "id": plan["id"],
            "name": d["name"],
            "folder": plan.get("folder"),
            "channel": d["channel"],
            "format": d["format"],
            "status": d["status"],
            "post_date": d["post_date"],
            "source": plan.get("source", "folder"),
            "titles": [{
                "text": t["text"],
                "approved_at": t.get("approved_at"),
                "thumbnails": [{"label": th["label"], "score": th.get("score"), "rank": th.get("rank")}
                               for th in by_title.get(t["id"], [])],
            } for t in titles],
            "updated": plan.get("updated"),
        })
    return {"source": "BLKGRLCO Bin", "schema": 1, "exported_at": _now(), "projects": projects}


def write_export() -> Path | None:
    try:
        p = export_path()
        _write_json(p, build_export())
        return p
    except OSError:
        return None


# ---- ideas & the project list (Overview tab, sidebar) -----------------------------------

def add_ideas(text: str, channel: str = "@blkgrlco", fmt: str = "long-form") -> dict:
    """One idea per non-empty line. Each becomes a project under Not started.
    An idea whose name matches an existing project is skipped, not duplicated."""
    if channel not in CHANNELS:
        raise ValueError("Unknown channel")
    if fmt not in FORMATS:
        raise ValueError("Unknown video type")
    with _lock:
        have = {p["details"]["name"].strip().lower() for p in all_plans()}
        added, skipped = [], []
        for line in str(text).splitlines():
            name = LIST_MARK.sub("", line).strip()[:200]
            if not name:
                continue
            if name.lower() in have:
                skipped.append(name)
                continue
            added.append(new_plan(name, None, channel=channel, format=fmt, status="not-started")["id"])
            have.add(name.lower())
    return {"added": added, "skipped": skipped}


def summary(plan: dict) -> dict:
    d = plan["details"]
    folder = plan.get("folder")
    return {
        "id": plan["id"], "name": d["name"], "status": d["status"], "format": d["format"],
        "channel": d["channel"], "post_date": d["post_date"], "folder": folder,
        "folder_ok": bool(folder) and Path(folder).is_dir(), "test_copy": is_test_copy(folder),
        "titles": title_check(plan), "created": plan.get("created"),
    }


def link_folder(pid: str, folder: Path) -> dict:
    """Give an idea its T7 folder. Refuses a folder that already belongs to another video."""
    marker = folder / ".blkgrlco-bin" / "project.json"
    if marker.exists():
        try:
            other = json.loads(marker.read_text()).get("id")
        except ValueError:
            other = None
        if other and other != pid:
            try:
                o = get(other)
                if o.get("folder") == str(folder):
                    raise ValueError(f'That folder already belongs to "{o["details"]["name"]}".')
            except KeyError:
                pass
    plan = get(pid)
    if plan.get("folder") and Path(plan["folder"]).is_dir() and plan["folder"] != str(folder):
        raise ValueError("This video already has a folder.")
    return attach_folder(pid, folder)
