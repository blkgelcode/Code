"""RETENTION LOOP: what loses viewers?

1. In the Plan tab she lists the edit's clips in order (CapCut can't export a clip list) and
   links the posted YouTube video.
2. 48 hours and 7 days after it posts, the app pulls the audience retention curve
   (YouTube reports it in steps of 1% of the video's length). Pulls only happen while the Mac is
   on; anything missed is caught up the next time the app starts.
3. Every drop of 5 percentage points or more is matched to the clip playing at that moment.
4. Overview → Retention keeps a running "what loses viewers" table by clip category.
"""
from __future__ import annotations

import datetime as dt
import logging
import re

from . import registry, settings as settings_mod, youtube

log = logging.getLogger("blkbin.retention")

DROP = 0.05                     # 5 percentage points of the audience
PULLS = {"48h": dt.timedelta(hours=48), "7d": dt.timedelta(days=7)}
VIDEO_ID = re.compile(r"(?:v=|youtu\.be/|shorts/|live/|embed/)([A-Za-z0-9_-]{11})|^([A-Za-z0-9_-]{11})$")


def parse_video_id(text: str) -> str:
    m = VIDEO_ID.search((text or "").strip())
    if not m:
        raise ValueError("Paste the YouTube link or the 11-character video id.")
    return m.group(1) or m.group(2)


# ---- the edit's clip order ------------------------------------------------------------------

def set_edit_order(pid: str, items: list, media_project=None) -> dict:
    """items: [{fid, seconds}] in the order they play. Names and categories come from the Media tab."""
    plan = registry.get(pid)
    cards = {c["fid"]: c for c in (media_project.view()["cards"] if media_project else [])}
    known = {it["fid"]: it for it in (plan.get("edit", {}).get("order") or [])}
    order = []
    for it in items[:500]:
        fid = str(it.get("fid", ""))
        c, k = cards.get(fid), known.get(fid, {})
        if not c and not k:
            raise ValueError("That clip isn't in this project.")
        try:
            secs = float(it.get("seconds") or 0)
        except (TypeError, ValueError):
            raise ValueError("Seconds must be a number.")
        if secs <= 0 or secs > 6 * 3600:
            raise ValueError("Each clip needs how many seconds of it are used (more than 0).")
        order.append({"fid": fid, "name": c["name"] if c else k.get("name"),
                      "category": c["category"] if c else k.get("category"),
                      "seconds": round(secs, 2)})
    plan.setdefault("edit", {})["order"] = order
    return registry.save(plan)


def link_video(pid: str, text: str) -> dict:
    vid = parse_video_id(text)
    info = youtube.video_info(vid)
    if info["channel_id"] not in youtube.channels():
        raise ValueError(f"That video is on “{info['channel']}”, which isn't connected. Connect it in Settings → Connections.")
    with registry.lock():
        plan = registry.get(pid)
        plan.setdefault("edit", {}).update(video_id=vid, channel_id=info["channel_id"], title=info["title"],
                                            published=info["published"], duration=info["duration"])
        plan.setdefault("retention", {})
        return registry.save(plan)


def unlink_video(pid: str) -> dict:
    plan = registry.get(pid)
    edit = plan.setdefault("edit", {})
    for k in ("video_id", "channel_id", "title", "published", "duration"):
        edit.pop(k, None)
    return registry.save(plan)  # past pulls stay in plan["retention"]


# ---- matching drops to clips ------------------------------------------------------------------------

def timeline(order: list[dict]) -> list[dict]:
    t, out = 0.0, []
    for it in order:
        out.append({**it, "start": t, "end": t + it["seconds"]})
        t += it["seconds"]
    return out


def find_drops(points: list[list[float]], duration: float) -> list[dict]:
    """A drop = a run of steep steps that together lose DROP (5 points) or more of the audience.
    Every curve falls a little all the time; a step is steep when it loses at least twice the
    curve's typical step (and at least half a point)."""
    pts = sorted(points)
    losses = [pts[k - 1][1] - pts[k][1] for k in range(1, len(pts))]
    falling = sorted(x for x in losses if x > 0)
    typical = falling[len(falling) // 2] if falling else 0
    steep = max(2 * typical, 0.005)
    drops, i = [], 1
    while i < len(pts):
        if pts[i - 1][1] - pts[i][1] >= steep:
            j = i
            while j + 1 < len(pts) and pts[j][1] - pts[j + 1][1] >= steep:
                j += 1
            lost = pts[i - 1][1] - pts[j][1]
            if lost >= DROP - 1e-9:
                worst = max(range(i, j + 1), key=lambda k: pts[k - 1][1] - pts[k][1])
                drops.append({"from": round(pts[i - 1][0] * duration, 1), "to": round(pts[j][0] * duration, 1),
                              "t": round(pts[worst][0] * duration, 1), "lost": round(lost, 3),
                              "before": round(pts[i - 1][1], 3), "after": round(pts[j][1], 3)})
            i = j + 1
        else:
            i += 1
    return drops


def match(drops: list[dict], order: list[dict], duration: float) -> tuple[list[dict], str]:
    """Attach the clip playing at each drop. If the clip list's total length doesn't match the
    video, times are scaled to fit and the note says so."""
    tl = timeline(order)
    total = tl[-1]["end"] if tl else 0
    note = ""
    scale = 1.0
    if not tl:
        note = "No clip order yet: add it in Plan → Retention to see which clips lose viewers."
    elif duration and abs(total - duration) > max(2.0, 0.02 * duration):
        scale = total / duration
        note = (f"Your clip list adds up to {total:.0f}s but the video is {duration:.0f}s, "
                f"so times were scaled to fit. Fix the seconds for exact matches.")
    out = []
    for d in drops:
        t = d["t"] * scale
        clip = next((c for c in tl if c["start"] <= t < c["end"]), tl[-1] if tl and t >= total else None)
        out.append({**d, "clip": clip["name"] if clip else None, "fid": clip["fid"] if clip else None,
                    "category": clip["category"] if clip else None})
    return out, note


def analyze(points: list[list[float]], duration: float, order: list[dict]) -> dict:
    drops, note = match(find_drops(points, duration), order, duration)
    return {"points": points, "duration": duration, "drops": drops, "note": note,
            "hold_3s": youtube.hold_at(points, 3, duration), "hold_30s": youtube.hold_at(points, 30, duration),
            "step_seconds": round(duration / 100, 1) if duration else None}


# ---- pulling ---------------------------------------------------------------------------------------------

def _published(edit: dict) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(edit["published"].replace("Z", "+00:00"))
    except (KeyError, AttributeError, ValueError):
        return None


def pull(pid: str, label: str, now: dt.datetime | None = None) -> dict:
    plan = registry.get(pid)
    edit = plan.get("edit") or {}
    if not edit.get("video_id"):
        raise ValueError("Link the posted YouTube video first.")
    pub = _published(edit)
    now = now or dt.datetime.now(dt.timezone.utc)
    start = (pub or now).date().isoformat()
    points = youtube.retention(edit["channel_id"], edit["video_id"], start, now.date().isoformat())
    snap = analyze(points, edit.get("duration") or 0, edit.get("order") or [])
    snap.update(label=label, pulled=now.isoformat(timespec="seconds"),
                hours_after=round((now - pub).total_seconds() / 3600, 1) if pub else None)
    if not points:
        snap["note"] = ("YouTube has no retention data for this video yet (it can take a few days, "
                        "and very small view counts may never show a curve).")
    with registry.lock():
        plan = registry.get(pid)  # re-read: the plan may have changed during the YouTube call
        plan.setdefault("retention", {})[label] = snap
        return registry.save(plan)


def reanalyze(pid: str) -> dict:
    """Re-match saved curves after the clip order changes. No YouTube call."""
    plan = registry.get(pid)
    edit = plan.get("edit") or {}
    for label, snap in (plan.get("retention") or {}).items():
        new = analyze(snap.get("points") or [], snap.get("duration") or edit.get("duration") or 0, edit.get("order") or [])
        snap.update({k: new[k] for k in ("drops", "note")})
        if not snap.get("points"):
            snap["note"] = "No retention data in this pull."
    return registry.save(plan)


def due(plan: dict, now: dt.datetime) -> list[str]:
    edit = plan.get("edit") or {}
    pub = _published(edit)
    if not edit.get("video_id") or not pub:
        return []
    have = plan.get("retention") or {}
    return [label for label, after in PULLS.items()
            if now >= pub + after and not (have.get(label) or {}).get("points")
            and (have.get(label) or {}).get("tries", 0) < 6]


def run_due(now: dt.datetime | None = None) -> list[str]:
    """Called on start and every 30 minutes. Returns what was pulled."""
    now = now or dt.datetime.now(dt.timezone.utc)
    pulled = []
    if not youtube.channels():
        return pulled
    for plan in registry.all_plans():
        for label in due(plan, now):
            try:
                pull(plan["id"], label, now)
                pulled.append(f"{plan['details']['name']} {label}")
            except Exception as exc:  # retry on the next tick, a few times
                log.warning("retention pull %s %s failed: %s", plan["id"], label, exc)
                with registry.lock():
                    p = registry.get(plan["id"])
                    snap = p.setdefault("retention", {}).setdefault(label, {})
                    snap["tries"] = snap.get("tries", 0) + 1
                    snap["error"] = str(exc)[:200]
                    registry.save(p)
    return pulled


# ---- what loses viewers ------------------------------------------------------------------------------------

def loses_viewers() -> dict:
    """Across every posted video with a curve and a clip list: per clip category, how much screen
    time it got and how many 5-point drops happened during it."""
    cfg = settings_mod.load()
    names = {c["id"]: c["name"] for c in cfg["categories"]}
    stats: dict[str, dict] = {}
    videos = []
    for plan in registry.all_plans():
        snaps = plan.get("retention") or {}
        snap = snaps.get("7d") if (snaps.get("7d") or {}).get("points") else snaps.get("48h")
        order = (plan.get("edit") or {}).get("order") or []
        if not snap or not snap.get("points") or not order:
            continue
        videos.append({"id": plan["id"], "name": plan["details"]["name"], "pull": snap.get("label"),
                       "drops": len(snap.get("drops", [])), "hold_30s": snap.get("hold_30s")})
        for it in order:
            s = stats.setdefault(it.get("category") or "unknown", {"seconds": 0.0, "drops": 0, "lost": 0.0, "clips": []})
            s["seconds"] += it["seconds"]
        for d in snap.get("drops", []):
            s = stats.setdefault(d.get("category") or "unknown", {"seconds": 0.0, "drops": 0, "lost": 0.0, "clips": []})
            s["drops"] += 1
            s["lost"] += d["lost"]
            s["clips"].append({"video": plan["details"]["name"], "clip": d.get("clip"), "t": d["t"], "lost": d["lost"]})
    rows = []
    for cat, s in stats.items():
        minutes = s["seconds"] / 60
        rows.append({"category": cat, "name": names.get(cat, cat.replace("-", " ").title()),
                     "minutes": round(minutes, 1), "drops": s["drops"],
                     "per_10_min": round(s["drops"] / minutes * 10, 2) if minutes else None,
                     "avg_lost": round(s["lost"] / s["drops"], 3) if s["drops"] else None,
                     "worst": sorted(s["clips"], key=lambda c: -c["lost"])[:3]})
    rows.sort(key=lambda r: -(r["per_10_min"] or 0))
    return {"rows": rows, "videos": videos}
