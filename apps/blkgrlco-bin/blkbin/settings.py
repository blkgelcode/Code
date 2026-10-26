"""App-wide settings, stored outside the repo and outside the T7.

macOS: ~/Library/Application Support/BLKGRLCO Bin/
Elsewhere (tests, Linux): ~/.blkgrlco-bin/
Override with the BLKBIN_HOME environment variable.
"""
from __future__ import annotations

import copy
import json
import os
import sys
import threading
from pathlib import Path

PALETTE = [
    "#F0DAC2", "#B68A71", "#B4AD7F", "#636407", "#A8B118",
    "#EBB9BA", "#8C0532", "#49001B", "#2E1500",
]

DEFAULT_CATEGORIES = [
    {
        "id": "talking-head", "name": "Talking Head", "color": "#8C0532",
        "hint": "She talks to camera. Her face is the subject, usually centered, "
                "and she speaks for most of the clip.",
    },
    {
        "id": "b-roll", "name": "B-Roll", "color": "#636407",
        "hint": "Visual footage without sustained to-camera talking: places, hands, "
                "food, walking, details, cutaways. Background chatter or music can be present.",
    },
    {
        "id": "screen-recording", "name": "Screen Recording", "color": "#B68A71",
        "hint": "A capture of a phone or computer screen: app UI, browser, settings, feeds.",
    },
    {
        "id": "music", "name": "Music", "color": "#A8B118",
        "hint": "An audio file that is a song or music bed.",
    },
    {
        "id": "sound-effects", "name": "Sound Effects", "color": "#EBB9BA",
        "hint": "A short audio file: whoosh, click, pop, ambience, foley.",
    },
    {
        "id": "photos", "name": "Photos", "color": "#B4AD7F",
        "hint": "A still image.",
    },
]

NAME_FORMATS = {
    "date_category_title": "{date}_{category}-{title}",
    "date_title": "{date}_{title}",
    "date_category_seq": "{date}_{category}_{seq}",
    "project_date_title": "{project}_{date}_{title}",
    "keep": "{original}",
}

DEFAULTS = {
    "categories": DEFAULT_CATEGORIES,
    "name_format": "date_category_title",
    "speech_thresholds": {"some": 0.05, "lots": 0.40},
    "whisper_model": "small",
    "claude_model": "claude-opus-5-5",
    "recent_projects": [],
    "default_picker_location": "/Volumes/Untitled/project hhh",
}

_lock = threading.RLock()


def app_home() -> Path:
    env = os.environ.get("BLKBIN_HOME")
    if env:
        home = Path(env)
    elif sys.platform == "darwin":
        home = Path.home() / "Library" / "Application Support" / "BLKGRLCO Bin"
    else:
        home = Path.home() / ".blkgrlco-bin"
    home.mkdir(parents=True, exist_ok=True)
    return home


def _path() -> Path:
    return app_home() / "settings.json"


def load() -> dict:
    with _lock:
        data = copy.deepcopy(DEFAULTS)
        p = _path()
        if p.exists():
            try:
                stored = json.loads(p.read_text())
                data.update({k: v for k, v in stored.items() if k in DEFAULTS})
            except (OSError, ValueError):
                pass
        return data


def save(data: dict) -> dict:
    with _lock:
        merged = load()
        for key, value in data.items():
            if key in DEFAULTS:
                merged[key] = value
        _validate(merged)
        tmp = _path().with_suffix(".tmp")
        tmp.write_text(json.dumps(merged, indent=2))
        tmp.replace(_path())
        return merged


def _validate(data: dict) -> None:
    seen = set()
    for cat in data["categories"]:
        name = str(cat.get("name", "")).strip()
        if not name or any(ch in name for ch in "/:\\"):
            raise ValueError(f"Category name {name!r} can't be empty or contain / : \\")
        if name.lower() in seen:
            raise ValueError(f"Two categories are both called {name!r}")
        seen.add(name.lower())
        cat["name"] = name
        if not cat.get("id"):
            cat["id"] = slug_id(name, {c.get("id") for c in data["categories"]})
    if data["name_format"] not in NAME_FORMATS:
        raise ValueError("Unknown name format")


def slug_id(name: str, taken: set) -> str:
    import re
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "category"
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    return candidate


def category(settings: dict, cat_id: str | None) -> dict | None:
    for cat in settings["categories"]:
        if cat["id"] == cat_id:
            return cat
    return None


def remember_project(path: str) -> None:
    data = load()
    recent = [p for p in data["recent_projects"] if p != path]
    data["recent_projects"] = [path] + recent[:9]
    save(data)


# --- API key: kept in the app folder's .env, never in the repo ---------------

def env_path() -> Path:
    return app_home() / ".env"


def load_env() -> None:
    p = env_path()
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def set_api_key(key: str) -> None:
    key = key.strip()
    p = env_path()
    lines = []
    if p.exists():
        lines = [l for l in p.read_text().splitlines() if not l.startswith("ANTHROPIC_API_KEY=")]
    if key:
        lines.append(f"ANTHROPIC_API_KEY={key}")
        os.environ["ANTHROPIC_API_KEY"] = key
    else:
        os.environ.pop("ANTHROPIC_API_KEY", None)
    p.write_text("\n".join(lines) + "\n")
    os.chmod(p, 0o600)


def has_api_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))
