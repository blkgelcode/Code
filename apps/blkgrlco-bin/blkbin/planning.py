"""Plan tab actions: thumbnails, scoring, title links, script with music cues."""
from __future__ import annotations

import io
import logging
import re
import secrets
import shutil
from pathlib import Path

from PIL import Image

from . import registry, settings as settings_mod, thumbs, vision

log = logging.getLogger("blkbin.planning")

SONG_TOKEN = re.compile(r"@\[([^\]\n]{1,200})\]\(([0-9a-f]{16}(?:~\d+)?)\)")
MAX_THUMB_BYTES = 15 * 1024 * 1024


def thumbs_dir(pid: str) -> Path:
    d = registry.project_dir(pid) / "thumbs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _next_label(plan: dict) -> str:
    used = {t["label"] for t in plan["thumbs"]}
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if ch not in used:
            return ch
    return "Z" + secrets.token_hex(1)


def add_thumbnail(pid: str, name: str, data: bytes) -> dict:
    if len(data) > MAX_THUMB_BYTES:
        raise ValueError("That image is over 15 MB.")
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
            fmt = (im.format or "").upper()
    except Exception:
        raise ValueError(f"{name} isn't an image the app can read.")
    if fmt not in ("PNG", "JPEG", "WEBP"):
        raise ValueError(f"{name}: use PNG or JPG.")
    plan = registry.get(pid)
    tid = "th-" + secrets.token_hex(3)
    ext = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}[fmt]
    (thumbs_dir(pid) / f"{tid}{ext}").write_bytes(data)
    plan["thumbs"].append({
        "id": tid, "label": _next_label(plan), "file": f"{tid}{ext}", "original_name": Path(name).name,
        "title_id": None, "score": None, "rank": None, "checks": [], "previews": {},
    })
    return registry.save(plan)


def score_all(pid: str, ids: list[str] | None = None) -> dict:
    """Score thumbnails. Claude calls run without holding the plan, then results are merged
    into the latest plan, so title ticks made meanwhile aren't lost."""
    cfg = settings_mod.load()
    results = {}
    for t in registry.get(pid)["thumbs"]:
        if ids and t["id"] not in ids:
            continue
        path = thumbs_dir(pid) / t["file"]
        facts, note = None, ""
        try:
            facts = vision.thumbnail_facts(path, cfg)
        except Exception as exc:  # keep the local checks even if Claude fails
            log.warning("thumbnail reading failed: %s", exc)
            note = f"Claude couldn't read it ({type(exc).__name__}); local checks only."
        result = thumbs.score(path, facts)
        results[t["id"]] = dict(score=result["score"], base=result["base"], base_from=result["base_from"],
                                why=result["why"], checks=result["checks"], note=note, facts=facts,
                                previews=thumbs.write_previews(path, thumbs_dir(pid), t["id"]))
    with registry.lock():
        plan = registry.get(pid)
        for t in plan["thumbs"]:
            if t["id"] in results:
                t.update(results[t["id"]])
        thumbs.rank([t for t in plan["thumbs"] if t.get("score") is not None])
        return registry.save(plan)


def update_thumbnail(pid: str, tid: str, changes: dict) -> dict:
    plan = registry.get(pid)
    t = next((t for t in plan["thumbs"] if t["id"] == tid), None)
    if not t:
        raise KeyError(tid)
    if "title_id" in changes:
        title_id = changes["title_id"] or None
        if title_id and not any(x["id"] == title_id for x in plan["titles"]):
            raise ValueError("Unknown title")
        t["title_id"] = title_id
    return registry.save(plan)


def remove_thumbnail(pid: str, tid: str) -> dict:
    """Takes it off the plan. The image is kept in thumbs/removed/, never deleted."""
    plan = registry.get(pid)
    t = next((t for t in plan["thumbs"] if t["id"] == tid), None)
    if not t:
        raise KeyError(tid)
    removed = thumbs_dir(pid) / "removed"
    removed.mkdir(exist_ok=True)
    src = thumbs_dir(pid) / t["file"]
    if src.exists():
        shutil.move(str(src), str(removed / t["file"]))
    plan["thumbs"].remove(t)
    thumbs.rank([x for x in plan["thumbs"] if x.get("score") is not None])
    return registry.save(plan)


# ---- script & music --------------------------------------------------------------

def set_script(pid: str, text: str) -> dict:
    plan = registry.get(pid)
    plan["script"] = str(text)[:500_000]
    return registry.save(plan)


def music_files(media_project) -> list[dict]:
    """This project's Music files (or any audio file not sorted yet), for @ tagging."""
    if media_project is None:
        return []
    out = []
    for e in media_project.entries():
        if e.get("category") == "music" or (e["kind"] == "audio" and not e.get("category")):
            out.append({"fid": e["fid"], "name": Path(e["path"]).name, "duration": e.get("duration"),
                        "category": e.get("category")})
    return sorted(out, key=lambda x: x["name"].lower())


def cues(script: str, music: list[dict]) -> list[dict]:
    """Every song tag in the script, in order, with the line it sits on."""
    known = {m["fid"]: m for m in music}
    out = []
    for n, line in enumerate(script.splitlines(), start=1):
        for m in SONG_TOKEN.finditer(line):
            context = SONG_TOKEN.sub(lambda x: "♪" + x.group(1), line).strip()
            out.append({"line": n, "name": m.group(1), "fid": m.group(2), "missing": m.group(2) not in known,
                        "context": context[:140]})
    return out
