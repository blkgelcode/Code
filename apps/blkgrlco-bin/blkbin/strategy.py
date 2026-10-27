"""Phase 5: the Strategy tab. Audience Bullseye, Hook Machine, Channel Audit.

Shared rules:
- Data comes from the YouTube Data API (with a connected channel's sign-in) and YouTube Analytics.
- Only videos from the last 12 months count. Every number keeps the video it came from.
- Outlier score = the video's views ÷ the median views of its channel's last 30 uploads.
- Audiences: @blkgrlco → Nia · @blkgrlcotoo → Zara · podcast → Amara.
- A saved profile or rule is never replaced without her yes (the app asks first).

Other creators' video frames are never downloaded (YouTube's terms). Their first-5-second lines
can be pasted in (or imported from a TubeLab transcript run in a Claude session).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import logging
import re
import secrets
import statistics
import time
from pathlib import Path

from . import registry, settings as settings_mod, vision, youtube

log = logging.getLogger("blkbin.strategy")

AUDIENCE = {"@blkgrlco": "nia", "@blkgrlcotoo": "zara", "podcast": "amara"}
PERSONA = {"nia": "Nia", "zara": "Zara", "amara": "Amara"}
PROFILE_FIELDS = {
    "who": "Who she is",
    "goals": "Her goals",
    "tried": "What she's already tried",
    "where_watch": "Where and when she watches",
    "pains": "What she's struggling with",
    "lanes": "Search lanes: topics to look for, one per line",
    "seed_channels": "Channels she already watches: @handles or links, one per line",
}
ASK_FIRST = ["goals", "tried", "where_watch"]   # the questions the spec says to ask when missing
RULE_FIELDS = {
    "oct21": "Oct 21 outlier-study hook & title rules (@blkgrlco dailies and long-forms)",
    "filming": "What she can film Thursday–Saturday",
    "voice": "Her voice: words she uses, words she never uses",
}
SMALL = 100_000
OUTLIER_MIN = 3.0
LONG_FORMS = {"long-form", "weekly long-form"}
DAILY = {"daily short"}
CACHE_HOURS = 24


class StrategyError(Exception):
    pass


# ---- storage ----------------------------------------------------------------------------------

def _dir(*parts) -> Path:
    d = settings_mod.app_home() / "strategy" / Path(*parts) if parts else settings_mod.app_home() / "strategy"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _read(name: str, default):
    p = _dir() / name
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text())
    except ValueError:
        return default


def _write(name: str, data) -> None:
    p = _dir() / name
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1))
    tmp.replace(p)


def _key(channel_key: str) -> str:
    if channel_key not in AUDIENCE:
        raise StrategyError("Unknown channel.")
    return channel_key.strip("@") or "podcast"


def _lines(text: str) -> list[str]:
    return [re.sub(r"^\s*(?:[-•*]|\d{1,2}[.)])\s+", "", x).strip() for x in str(text or "").splitlines() if x.strip()]


def _today(today=None) -> dt.date:
    return today or dt.date.today()


# ---- profiles and rules (never replaced without her yes) ------------------------------------------

def profiles() -> dict:
    stored = _read("profiles.json", {})
    out = {}
    for key, name in PERSONA.items():
        p = {f: "" for f in PROFILE_FIELDS}
        p.update({k: v for k, v in (stored.get(key) or {}).items() if k in PROFILE_FIELDS or k in ("name", "updated")})
        p["name"] = name
        p["channel"] = next(c for c, a in AUDIENCE.items() if a == key)
        p["missing"] = [f for f in ASK_FIRST if not str(p.get(f, "")).strip()]
        out[key] = p
    return out


def _guarded_save(name: str, current: dict, changes: dict, allowed: dict, confirm: bool) -> dict:
    clean = {k: str(v).strip()[:4000] for k, v in changes.items() if k in allowed}
    replacing = [{"field": k, "label": allowed[k], "old": current.get(k, ""), "new": v}
                 for k, v in clean.items() if str(current.get(k, "")).strip() and v != current.get(k, "")]
    if replacing and not confirm:
        return {"saved": False, "needs_confirm": True, "changes": replacing}
    current.update(clean)
    current["updated"] = dt.datetime.now().isoformat(timespec="seconds")
    return {"saved": True, "needs_confirm": False, "changes": replacing, "data": current}


def save_profile(key: str, changes: dict, confirm: bool = False) -> dict:
    if key not in PERSONA:
        raise StrategyError("Unknown profile.")
    stored = _read("profiles.json", {})
    r = _guarded_save("profiles.json", dict(stored.get(key) or {}), changes, PROFILE_FIELDS, confirm)
    if r["saved"]:
        stored[key] = r.pop("data")
        _write("profiles.json", stored)
    r["profiles"] = profiles()
    return r


def rules() -> dict:
    stored = _read("rules.json", {})
    return {k: stored.get(k, "") for k in RULE_FIELDS} | {"updated": stored.get("updated")}


def save_rules(changes: dict, confirm: bool = False) -> dict:
    stored = _read("rules.json", {})
    r = _guarded_save("rules.json", stored, changes, RULE_FIELDS, confirm)
    if r["saved"]:
        _write("rules.json", r.pop("data"))
    r["rules"] = rules()
    return r


# ---- Claude ---------------------------------------------------------------------------------------------

def _claude(system: str, prompt: str, schema: dict, effort: str = "medium") -> dict:
    """One structured Claude call. Tests replace this."""
    if not vision.available():
        raise StrategyError("This needs Claude. Add your Anthropic API key in Settings → Connections.")
    import anthropic

    cfg = settings_mod.load()
    response = anthropic.Anthropic().beta.messages.create(
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        model=cfg.get("claude_model", "claude-opus-5-5"), max_tokens=16000, system=system,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
    )
    if response.stop_reason == "refusal":
        raise StrategyError("Claude declined this request.")
    return json.loads(next(b.text for b in response.content if b.type == "text"))


def _profile_text(p: dict) -> str:
    return "\n".join(f"- {PROFILE_FIELDS[f]}: {p[f]}" for f in PROFILE_FIELDS if str(p.get(f, "")).strip()) or "(empty)"


# ---- YouTube research with a cache (search costs 100 quota units) --------------------------------------------

def _cached(kind: str, ident: str, fn, hours: float = CACHE_HOURS):
    name = hashlib.sha1(f"{kind}:{ident}".encode()).hexdigest()[:16]
    p = _dir("cache") / f"{kind}-{name}.json"
    if p.exists() and time.time() - p.stat().st_mtime < hours * 3600:
        try:
            return json.loads(p.read_text())
        except ValueError:
            pass
    data = fn()
    p.write_text(json.dumps(data))
    return data


def _published(v: dict) -> dt.date | None:
    try:
        return dt.datetime.fromisoformat(v["published"].replace("Z", "+00:00")).date()
    except (KeyError, AttributeError, ValueError):
        return None


def score_uploads(uploads: list[dict], today=None) -> dict:
    """Median views of the last 30 uploads, and each recent video's outlier score against it."""
    today = _today(today)
    last30 = uploads[:30]
    median = statistics.median([v["views"] for v in last30]) if last30 else 0
    recent = []
    for v in uploads:
        d = _published(v)
        if d and (today - d).days <= 365:
            recent.append({**v, "median": median, "score": round(v["views"] / median, 2) if median else None,
                           "url": f"https://www.youtube.com/watch?v={v['id']}"})
    return {"median": median, "recent": recent}


def _uploads(channel_id: str, prefer: str | None) -> list[dict]:
    return _cached("uploads", channel_id, lambda: youtube.channel_uploads(channel_id, 50, prefer))


def _resolve_seed(seed: str, prefer: str | None) -> str | None:
    m = re.search(r"(UC[A-Za-z0-9_-]{22})", seed)
    if m:
        return m.group(1)
    handle = re.search(r"@([A-Za-z0-9._-]+)", seed)
    if not handle:
        return None
    r = _cached("handle", handle.group(1).lower(),
                lambda: youtube.data("channels", {"part": "id", "forHandle": "@" + handle.group(1)}, prefer), 24 * 30)
    items = r.get("items") or []
    return items[0]["id"] if items else None


def _channel_stats(ids: list[str], prefer: str | None) -> dict:
    out = {}
    for i in range(0, len(ids), 50):
        batch = ids[i:i + 50]
        r = _cached("chstats", ",".join(sorted(batch)),
                    lambda: youtube.data("channels", {"part": "snippet,statistics", "id": ",".join(batch),
                                                       "maxResults": 50}, prefer))
        for c in r.get("items", []):
            st = c.get("statistics", {})
            out[c["id"]] = {"id": c["id"], "title": c["snippet"]["title"], "handle": c["snippet"].get("customUrl", ""),
                            "subs": None if st.get("hiddenSubscriberCount") else int(st.get("subscriberCount", 0) or 0),
                            "videos": int(st.get("videoCount", 0) or 0), "views": int(st.get("viewCount", 0) or 0)}
    return out


# ---- 1. Audience Bullseye ------------------------------------------------------------------------------------

BUCKET_SCHEMA = {
    "type": "object",
    "properties": {"topics": {"type": "array", "items": {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "video_ids": {"type": "array", "items": {"type": "string"}},
            "audience_fit": {"type": "integer"}, "fit_why": {"type": "string"},
            "filmable": {"type": "integer"}, "film_why": {"type": "string"},
            "funnel": {"type": "string", "enum": ["Top", "Middle", "Bottom"]},
            "idea": {"type": "string"},
        },
        "required": ["name", "video_ids", "audience_fit", "fit_why", "filmable", "film_why", "funnel", "idea"],
        "additionalProperties": False}}},
    "required": ["topics"], "additionalProperties": False,
}


def demand_points(n: int) -> int:
    return 0 if n <= 0 else 1 if n == 1 else 2 if n <= 3 else 3 if n <= 6 else 4


def gap_points(small_share: float) -> int:
    """Small channels (<100K) breaking out on a topic means it isn't locked up by big creators."""
    return 4 if small_share >= 0.75 else 3 if small_share >= 0.5 else 2 if small_share >= 0.25 else 1 if small_share > 0 else 0


def ring(score: int) -> str:
    return "bullseye" if score >= 13 else "inner" if score >= 9 else "middle" if score >= 5 else "outer"


def run_bullseye(job, channel_key: str, today=None) -> dict:
    key, today = _key(channel_key), _today(today)
    aud = AUDIENCE[channel_key]
    prof = profiles()[aud]
    lanes, seeds = _lines(prof["lanes"]), _lines(prof["seed_channels"])
    if not lanes and not seeds:
        raise StrategyError(f"Add search lanes or channels {PERSONA[aud]} watches to her profile first.")
    prefer = channel_key if channel_key.startswith("@") else None
    own = set(youtube.channels())
    since = (dt.datetime.combine(today - dt.timedelta(days=365), dt.time()).isoformat() + "Z")
    found: dict[str, set] = {}
    units = 0
    for i, lane in enumerate(lanes):
        job.progress(i, len(lanes) + 3, f"Searching “{lane}”")
        r = _cached("search", f"{lane}|{since[:10]}", lambda: youtube.data("search", {
            "part": "snippet", "type": "video", "q": lane, "maxResults": 50, "publishedAfter": since,
            "relevanceLanguage": "en", "order": "relevance"}, prefer))
        units += 100
        for it in r.get("items", []):
            found.setdefault(it["snippet"]["channelId"], set()).add(lane)
    for s in seeds:
        cid = _resolve_seed(s, prefer)
        if cid:
            found.setdefault(cid, set()).add("you follow them")
    for cid in own:
        found.pop(cid, None)
    job.progress(len(lanes), len(lanes) + 3, f"Checking {len(found)} channels")
    stats = _channel_stats(list(found), prefer)
    pool = sorted(stats.values(), key=lambda c: ((c["subs"] or 0) >= SMALL, -(c["views"] / max(c["videos"], 1))))[:40]
    measured = []
    for n, c in enumerate(pool):
        job.progress(len(lanes) + 1, len(lanes) + 3, f"Reading uploads {n + 1} of {len(pool)}: {c['title']}")
        ups = _uploads(c["id"], prefer)
        if len(ups) < 5:
            continue
        sc = score_uploads(ups, today)
        measured.append({**c, "median": sc["median"], "recent": sc["recent"], "lanes": sorted(found.get(c["id"], []))})
    small = sorted((c for c in measured if c["subs"] is not None and c["subs"] < SMALL), key=lambda c: -c["median"])
    big = sorted((c for c in measured if c not in small), key=lambda c: -c["median"])
    chosen = small[:15]
    if len(chosen) < 10:
        chosen += big[:10 - len(chosen)]
    outliers = []
    for c in chosen:
        for v in c["recent"]:
            if v["score"] and v["score"] >= OUTLIER_MIN:
                outliers.append({"id": v["id"], "title": v["title"], "channel": c["title"], "channel_id": c["id"],
                                 "subs": c["subs"], "views": v["views"], "median": c["median"], "score": v["score"],
                                 "published": v["published"], "thumbnail": v.get("thumbnail"), "url": v["url"],
                                 "duration": v.get("duration")})
    outliers.sort(key=lambda o: -o["score"])
    result = {
        "channel": channel_key, "persona": PERSONA[aud], "ran": dt.datetime.now().isoformat(timespec="seconds"),
        "lanes": lanes, "quota_units": units + 3 * len(pool) + len(found) // 50 + 1,
        "channels": [{k: c[k] for k in ("id", "title", "handle", "subs", "videos", "median", "lanes")} |
                     {"outliers": sum(1 for o in outliers if o["channel_id"] == c["id"]),
                      "url": f"https://www.youtube.com/channel/{c['id']}"} for c in chosen],
        "outliers": outliers, "topics": [], "notes": [],
    }
    if len(chosen) < 10:
        result["notes"].append(f"Only {len(chosen)} channels qualified. Add more lanes or channels she watches.")
    if not outliers:
        result["notes"].append("No 3x outliers in the last 12 months among these channels.")
        _write(f"bullseye-{key}.json", result)
        return result
    job.progress(len(lanes) + 2, len(lanes) + 3, f"Grouping {len(outliers)} outliers into topics")
    r = rules()
    listing = "\n".join(f"{o['id']} | {o['score']}x | {o['channel']} | {o['title']}" for o in outliers[:150])
    data = _claude(
        "You group YouTube outlier videos into topic buckets for a creator's audience research. "
        "A topic is what the video is about for the viewer (not the format). Use only the video ids given. "
        "Every video goes in exactly one topic; make 4 to 12 topics. Score 0-4: audience_fit = how much this "
        "topic speaks to the audience profile; filmable = how easily she can film it in her Thursday-Saturday "
        "window given what she says she can film. funnel: Top = broad discovery for people who don't know her, "
        "Middle = deepens trust with people who know the problem, Bottom = turns viewers into community or "
        "customers. idea = one video idea for her on this topic, in her casual lowercase voice.",
        f"Audience: {PERSONA[aud]}\n{_profile_text(prof)}\n\nWhat she can film Thu–Sat: "
        f"{r['filming'] or '(not written yet: assume a talking head at home and day-in-the-life vlogs)'}\n\n"
        f"Outliers (id | outlier score | channel | title):\n{listing}", BUCKET_SCHEMA)
    by_id = {o["id"]: o for o in outliers}
    topics = []
    for t in data.get("topics", []):
        ids = [i for i in dict.fromkeys(t["video_ids"]) if i in by_id]
        if not ids:
            continue
        vids = [by_id[i] for i in ids]
        small_share = sum(1 for v in vids if v["subs"] is not None and v["subs"] < SMALL) / len(vids)
        parts = {"audience_fit": max(0, min(4, int(t["audience_fit"]))), "demand": demand_points(len(ids)),
                 "gap": gap_points(small_share), "filmable": max(0, min(4, int(t["filmable"])))}
        score = sum(parts.values())
        topics.append({"id": "tp-" + hashlib.sha1(t["name"].encode()).hexdigest()[:8], "name": t["name"],
                       "parts": parts, "score": score, "ring": ring(score), "funnel": t["funnel"], "idea": t["idea"],
                       "why": {"audience_fit": t["fit_why"], "filmable": t["film_why"],
                               "demand": f"{len(ids)} outlier{'s' if len(ids) != 1 else ''} (3x+ their channel's median)",
                               "gap": f"{round(small_share * 100)}% of them from channels under 100K subscribers"},
                       "video_ids": sorted(ids, key=lambda i: -by_id[i]["score"]),
                       "median_score": round(statistics.median(v["score"] for v in vids), 2)})
    topics.sort(key=lambda t: (-t["score"], -len(t["video_ids"])))
    result["topics"] = topics
    _write(f"bullseye-{key}.json", result)
    return result


def bullseye(channel_key: str) -> dict | None:
    data = _read(f"bullseye-{_key(channel_key)}.json", None)
    if data:
        sent = _read("sent-topics.json", {})
        for t in data.get("topics", []):
            t["sent"] = sent.get(f"{channel_key}:{t['id']}")
    return data


def send_topic(channel_key: str, topic_id: str, fmt: str = "long-form") -> dict:
    data = bullseye(channel_key)
    t = next((t for t in (data or {}).get("topics", []) if t["id"] == topic_id), None)
    if not t:
        raise StrategyError("That topic isn't in the latest Bullseye run.")
    with registry.lock():
        r = registry.add_ideas(t["idea"] or t["name"], channel_key, fmt)
    sent = _read("sent-topics.json", {})
    sent[f"{channel_key}:{topic_id}"] = (r["added"] or [None])[0] or "already in the idea bank"
    _write("sent-topics.json", sent)
    return r


# ---- 2. Hook Machine ---------------------------------------------------------------------------------------------

SKELETON_SCHEMA = {
    "type": "object",
    "properties": {"skeletons": {"type": "array", "items": {
        "type": "object",
        "properties": {"pattern": {"type": "string"}, "video_ids": {"type": "array", "items": {"type": "string"}},
                       "why_it_works": {"type": "string"}},
        "required": ["pattern", "video_ids", "why_it_works"], "additionalProperties": False}}},
    "required": ["skeletons"], "additionalProperties": False,
}
HOOKS_SCHEMA = {
    "type": "object",
    "properties": {"hooks": {"type": "array", "items": {
        "type": "object",
        "properties": {"hook": {"type": "string"}, "title": {"type": "string"},
                       "stops_scroll": {"type": "boolean"}, "why": {"type": "string"}},
        "required": ["hook", "title", "stops_scroll", "why"], "additionalProperties": False}}},
    "required": ["hooks"], "additionalProperties": False,
}


def openings() -> dict:
    return _read("openings.json", {})


def set_openings(text: str) -> dict:
    """Paste first-5-second lines: one per line as `<video link or id> <tab or |> <what they say>`,
    or a JSON object {video_id: text} (e.g. saved from a TubeLab transcript run)."""
    found = {}
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            found = {k: str(v).strip()[:400] for k, v in obj.items() if re.fullmatch(r"[A-Za-z0-9_-]{11}", k)}
    except ValueError:
        for line in str(text).splitlines():
            m = re.match(r"\s*(?:\S*?(?:v=|youtu\.be/|shorts/))?([A-Za-z0-9_-]{11})\S*\s*[\t|:]?\s*(.+)$", line)
            if m and m.group(2).strip():
                found[m.group(1)] = m.group(2).strip()[:400]
    if not found:
        raise StrategyError("Nothing to import. Use one line per video: link, then a tab or |, then the opening line.")
    data = openings()
    data.update(found)
    _write("openings.json", data)
    return {"imported": len(found), "total": len(data)}


def build_skeletons(job, channel_key: str) -> dict:
    key = _key(channel_key)
    bulls = bullseye(channel_key)
    if not bulls or not bulls.get("outliers"):
        raise StrategyError("Run the Audience Bullseye for this channel first: the Hook Machine studies its outliers.")
    top = bulls["outliers"][:60]
    opens = openings()
    job.progress(0, 1, f"Finding skeletons in {len(top)} outliers")
    listing = "\n".join(f"{o['id']} | {o['score']}x | title: {o['title']}" +
                        (f" | first 5s: {opens[o['id']]}" if o["id"] in opens else "") for o in top)
    data = _claude(
        "You find reusable hook and title skeletons in YouTube outliers. A skeleton keeps the structure and "
        "replaces the specifics with [slots], e.g. \"[number] [adjective] [things] that [result]\" or "
        "\"i tried [thing] for [time] and [surprise]\". Group videos that share a skeleton; a skeleton needs at "
        "least 2 videos. Use only the ids given. Make 4 to 10 skeletons.", listing, SKELETON_SCHEMA)
    by_id = {o["id"]: o for o in top}
    out = []
    for s in data.get("skeletons", []):
        ids = [i for i in dict.fromkeys(s["video_ids"]) if i in by_id]
        if len(ids) < 2:
            continue
        vids = sorted((by_id[i] for i in ids), key=lambda v: -v["score"])
        out.append({"id": "sk-" + hashlib.sha1(s["pattern"].encode()).hexdigest()[:8], "pattern": s["pattern"],
                    "why": s["why_it_works"], "count": len(ids),
                    "median_score": round(statistics.median(v["score"] for v in vids), 2),
                    "examples": [{k: v[k] for k in ("id", "title", "channel", "score", "views", "url", "thumbnail")} |
                                 {"opening": opens.get(v["id"])} for v in vids[:3]],
                    "video_ids": ids})
    out.sort(key=lambda s: (-s["median_score"], -s["count"]))
    result = {"channel": channel_key, "ran": dt.datetime.now().isoformat(timespec="seconds"), "skeletons": out,
              "openings_used": sum(1 for o in top if o["id"] in opens), "outliers_studied": len(top)}
    _write(f"hooks-{key}.json", result)
    return result


def skeletons(channel_key: str) -> dict | None:
    return _read(f"hooks-{_key(channel_key)}.json", None)


SERIES_90 = re.compile(r"\bday\s*(\d{1,2})\s*(?:of|/)\s*90\b", re.I)
SERIES_OPEN = re.compile(r"\bday\s*(\d{1,3})\b(?!\s*(?:of|/)\s*\d)", re.I)


def hook_checks(text: str, plan_name: str, persona: str) -> list[dict]:
    checks = []
    sentences = [s for s in re.split(r"(?<=[.!?])\s+(?=\S)", text.strip()) if s]
    checks.append({"label": "one sentence", "ok": len(sentences) == 1})
    checks.append({"label": "casual lowercase", "ok": text == text.lower()})
    m90 = SERIES_90.search(plan_name or "")
    if m90:
        n = m90.group(1)
        checks.append({"label": f"keeps “day {n} of 90”", "ok": bool(re.search(rf"\bday\s*{n}\s*of\s*90\b", text, re.I))})
    elif SERIES_OPEN.search(plan_name or ""):
        checks.append({"label": "uses the “until” format", "ok": " until " in f" {text.lower()} "})
    return checks


def generate_hooks(channel_key: str, skeleton_id: str, pid: str) -> dict:
    plan = registry.get(pid)
    sk = next((s for s in (skeletons(channel_key) or {}).get("skeletons", []) if s["id"] == skeleton_id), None)
    if not sk:
        raise StrategyError("Pick a skeleton from the latest Hook Machine run.")
    aud = AUDIENCE[channel_key]
    persona, prof, r = PERSONA[aud], profiles()[aud], rules()
    d = plan["details"]
    apply_oct21 = channel_key == "@blkgrlco" and (d["format"] in LONG_FORMS or d["format"] in DAILY)
    series = ""
    if SERIES_90.search(d["name"]):
        series = f"This is part of the 90-day run: every hook keeps “day {SERIES_90.search(d['name']).group(1)} of 90”."
    elif SERIES_OPEN.search(d["name"]):
        series = "This is an open-ended series: use the “until” format (e.g. “day 12 until i …”)."
    examples = "\n".join(f"- {e['title']} ({e['score']}x)" + (f" · opens with: {e['opening']}" if e.get("opening") else "")
                         for e in sk["examples"])
    data = _claude(
        f"You write video hooks (the first spoken line) for a creator, in her voice: casual, all lowercase, "
        f"exactly one sentence, an opinion plus a curiosity gap. Her audience is {persona}. Each hook must pass "
        f"\"would {persona} stop scrolling?\"; say honestly if it doesn't. Also give a matching title.",
        f"Skeleton: {sk['pattern']}\nWhy it works: {sk['why']}\nExamples:\n{examples}\n\n"
        f"Her video idea: {d['name']} ({d['format']} on {channel_key})\n"
        f"{('Script so far: ' + plan.get('script', '')[:1200]) if plan.get('script') else ''}\n\n"
        f"Audience profile ({persona}):\n{_profile_text(prof)}\n"
        f"{('Her voice: ' + r['voice']) if r['voice'] else ''}\n"
        f"{('Rules from her Oct 21 outlier study (follow them):' + chr(10) + r['oct21']) if apply_oct21 and r['oct21'] else ''}\n"
        f"{series}\nWrite 5 variations.", HOOKS_SCHEMA)
    hooks = []
    for hk in data.get("hooks", [])[:5]:
        text = hk["hook"].strip()
        hooks.append({"hook": text, "title": hk["title"].strip(), "stops_scroll": hk["stops_scroll"], "why": hk["why"],
                      "checks": hook_checks(text, d["name"], persona)})
    notes = []
    if apply_oct21 and not r["oct21"]:
        notes.append("The Oct 21 hook/title rules aren't in the app yet (Strategy → Profiles & rules), so they weren't applied.")
    return {"hooks": hooks, "skeleton": sk["pattern"], "persona": persona, "notes": notes}


def approve_hook(pid: str, text: str, skeleton: str = "", title: str = "") -> dict:
    plan = registry.get(pid)
    text = str(text).strip()[:300]
    if not text:
        raise StrategyError("Empty hook.")
    hooks = plan.setdefault("hooks", [])
    if not any(h["text"].lower() == text.lower() for h in hooks):
        hooks.append({"id": "hk-" + secrets.token_hex(3), "text": text, "skeleton": skeleton[:200],
                      "approved_at": dt.datetime.now().astimezone().isoformat(timespec="seconds")})
    if title.strip():
        registry.save(plan)
        return registry.add_titles(pid, title.strip())
    return registry.save(plan)


def remove_hook(pid: str, hid: str) -> dict:
    plan = registry.get(pid)
    plan["hooks"] = [h for h in plan.get("hooks", []) if h["id"] != hid]
    return registry.save(plan)


# ---- 3. Channel Audit (with the retention loop) ---------------------------------------------------------------

AUDIT_SCHEMA = {
    "type": "object",
    "properties": {"videos": {"type": "array", "items": {
        "type": "object",
        "properties": {"video_id": {"type": "string"}, "topic": {"type": "string"},
                       "format": {"type": "string", "enum": ["talking head", "vlog", "montage", "unclear"]},
                       "skeleton": {"type": "string"},
                       "story": {"type": "string", "enum": ["follows B1–B5", "partly", "doesn't", "unknown"]}},
        "required": ["video_id", "topic", "format", "skeleton", "story"], "additionalProperties": False}}},
    "required": ["videos"], "additionalProperties": False,
}
PATTERN_SCHEMA = {
    "type": "object",
    "properties": {"patterns": {"type": "array", "items": {
        "type": "object",
        "properties": {"name": {"type": "string"}, "template": {"type": "string"}, "finding": {"type": "string"},
                       "proof_video_ids": {"type": "array", "items": {"type": "string"}}},
        "required": ["name", "template", "finding", "proof_video_ids"], "additionalProperties": False}}},
    "required": ["patterns"], "additionalProperties": False,
}
STORY_MAP = "B1 hook, B2 stakes, B3 middle, B4 turn, B5 cold end"


def _retention_cached(channel_id: str, v: dict, today: dt.date) -> list:
    pub = _published(v) or today
    age = (today - pub).days
    return _cached("ret", f"{channel_id}:{v['id']}",
                   lambda: youtube.retention(channel_id, v["id"], pub.isoformat(), today.isoformat()),
                   hours=24 * (7 if age > 30 else 1))


def _format_from_edit(order: list[dict]) -> str | None:
    total = sum(i["seconds"] for i in order)
    if not total:
        return None
    share = lambda cats: sum(i["seconds"] for i in order if i.get("category") in cats) / total  # noqa: E731
    if share({"talking-head"}) >= 0.6:
        return "talking head"
    if share({"b-roll", "photos"}) >= 0.6:
        return "montage"
    return "vlog"


def own_videos(channel_id: str, today=None, limit: int = 50, job=None) -> list[dict]:
    today = _today(today)
    ups = [v for v in _cached("own", channel_id, lambda: youtube.channel_uploads(channel_id, limit), 6)
           if (_published(v) and (today - _published(v)).days <= 365)][:limit]
    for n, v in enumerate(ups):
        if job:
            job.note(f"Retention {n + 1} of {len(ups)}: {v['title'][:50]}")
        try:
            pts = _retention_cached(channel_id, v, today)
        except youtube.YouTubeError as exc:
            log.info("no retention for %s: %s", v["id"], exc)
            pts = []
        v["retention"] = pts
        v["hold_30s"] = youtube.hold_at(pts, 30, v["duration"]) if pts else None
        v["hold_3s"] = youtube.hold_at(pts, 3, v["duration"]) if pts else None
        v["step_seconds"] = round(v["duration"] / 100, 1) if v["duration"] else None
    return ups


def _compare(rows: list[dict], attr: str) -> list[dict]:
    values = sorted({r[attr] for r in rows})
    out = []
    for val in values:
        a = [r for r in rows if r[attr] == val and r["group"] == "above"]
        b = [r for r in rows if r[attr] == val and r["group"] == "below"]
        ret = [r["hold_30s"] for r in a + b if r["hold_30s"] is not None]
        out.append({"value": val, "above": len(a), "below": len(b),
                    "avg_hold_30s": round(sum(ret) / len(ret), 3) if ret else None})
    return sorted(out, key=lambda x: -(x["above"] - x["below"]))


def run_audit(job, channel_id: str, today=None) -> dict:
    today = _today(today)
    chans = youtube.channels()
    if channel_id not in chans:
        raise StrategyError("That channel isn't connected.")
    job.progress(0, 4, "Reading your last 50 uploads")
    vids = own_videos(channel_id, today, 50, job)
    if len(vids) < 4:
        raise StrategyError("Fewer than 4 uploads in the last 12 months: not enough to compare yet.")
    plans = {(p.get("edit") or {}).get("video_id"): p for p in registry.all_plans() if (p.get("edit") or {}).get("video_id")}
    median = statistics.median(v["views"] for v in vids)
    sk = [s["pattern"] for key in ("blkgrlco", "blkgrlcotoo", "podcast")
          for s in (_read(f"hooks-{key}.json", {}) or {}).get("skeletons", [])]
    lines = []
    for v in vids:
        p = plans.get(v["id"])
        script = (p or {}).get("script", "")
        lines.append(f"{v['id']} | {v['duration']}s | {v['title']} | description: {v['description'][:200]!r}"
                     + (f" | script: {script[:600]!r}" if script else " | script: none"))
    job.progress(1, 4, "Classifying topic, format, hook and story")
    data = _claude(
        "You audit a creator's own YouTube uploads. For each video give: topic (2-4 words, reuse the same words "
        "for the same topic), format (talking head / vlog / montage), skeleton = which of the given hook "
        f"skeletons the title or opening follows, or \"none\", story = does the script follow her 5-line story "
        f"map ({STORY_MAP})? Judge story only when a script is given; otherwise \"unknown\". Use the ids given.",
        "Hook skeletons:\n" + ("\n".join(f"- {s}" for s in sk) or "(none yet)") + "\n\nVideos (id | length | title | ...):\n"
        + "\n".join(lines), AUDIT_SCHEMA, effort="low")
    by_id = {x["video_id"]: x for x in data.get("videos", [])}
    rows = []
    for v in vids:
        c = by_id.get(v["id"], {})
        p = plans.get(v["id"])
        fmt_edit = _format_from_edit(((p or {}).get("edit") or {}).get("order") or [])
        rows.append({"id": v["id"], "title": v["title"], "views": v["views"], "published": v["published"],
                     "url": f"https://www.youtube.com/watch?v={v['id']}", "thumbnail": v.get("thumbnail"),
                     "duration": v["duration"], "group": "above" if v["views"] > median else "below",
                     "topic": (c.get("topic") or "unclear").lower(),
                     "format": fmt_edit or c.get("format") or "unclear",
                     "format_source": "your clip list" if fmt_edit else "guess from title",
                     "skeleton": c.get("skeleton") or "none", "story": c.get("story") or "unknown",
                     "hold_30s": v["hold_30s"], "hold_3s": v["hold_3s"], "step_seconds": v["step_seconds"]})
    compare = {attr: _compare(rows, attr) for attr in ("topic", "format", "skeleton", "story")}
    above = [r for r in rows if r["group"] == "above"]
    job.progress(2, 4, "Naming the patterns")
    pat = _claude(
        "You name patterns in a creator's channel audit: what her above-median videos share that her "
        "below-median ones don't. Each pattern: a short name, a reusable template she can follow, the finding "
        "in one sentence with the numbers, and exactly 2 of her own above-median videos as proof (ids given). "
        "Give 2 to 5 patterns. Don't invent numbers.",
        f"Median views: {median}\n\nComparison tables (value: above / below / avg share still watching at 30s):\n" +
        "\n".join(f"{attr}: " + "; ".join(f"{x['value']}: {x['above']}/{x['below']}/{x['avg_hold_30s']}" for x in tbl)
                  for attr, tbl in compare.items()) +
        "\n\nVideos (id | group | views | topic | format | skeleton | story | held at 30s):\n" +
        "\n".join(f"{r['id']} | {r['group']} | {r['views']} | {r['topic']} | {r['format']} | {r['skeleton']} | "
                  f"{r['story']} | {r['hold_30s']}" for r in rows), PATTERN_SCHEMA)
    above_ids = {r["id"] for r in above}
    patterns = []
    for x in pat.get("patterns", []):
        proof = [i for i in dict.fromkeys(x["proof_video_ids"]) if i in above_ids][:2]
        if proof:
            patterns.append({"name": x["name"], "template": x["template"], "finding": x["finding"],
                             "proof": [next(r for r in rows if r["id"] == i) for i in proof]})
    from . import retention
    result = {"channel_id": channel_id, "title": chans[channel_id].get("title"),
              "ran": dt.datetime.now().isoformat(timespec="seconds"), "median_views": median,
              "videos": rows, "compare": compare, "patterns": patterns, "loses_viewers": retention.loses_viewers()}
    _write(f"audit-{channel_id}.json", result)
    job.progress(4, 4, "Done")
    return result


def audit(channel_id: str) -> dict | None:
    return _read(f"audit-{channel_id}.json", None)


class _QuietJob:
    def progress(self, *a, **k):
        pass

    def note(self, *a, **k):
        pass


def last_sunday_slot(now: dt.datetime, hour: int) -> dt.datetime:
    days_back = (now.weekday() - 6) % 7
    slot = (now - dt.timedelta(days=days_back)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return slot if slot <= now else slot - dt.timedelta(days=7)


def run_sunday_audit_if_due(now: dt.datetime | None = None) -> list[str] | None:
    """Every Sunday after the weekly long-form posts (settings.audit_hour, 18:00 by default).
    If the Mac was off, the missed run happens the next time the app starts."""
    if not youtube.channels() or not vision.available():
        return None
    now = now or dt.datetime.now()
    slot = last_sunday_slot(now, int(settings_mod.load().get("audit_hour", 18)))
    state = _read("audit-state.json", {})
    if state.get("last") and dt.datetime.fromisoformat(state["last"]) >= slot:
        return None
    ran = []
    for cid, ch in youtube.channels().items():
        try:
            run_audit(_QuietJob(), cid)
            ran.append(ch.get("handle") or ch.get("title") or cid)
        except Exception as exc:
            log.warning("Sunday audit of %s failed: %s", cid, exc)
    _write("audit-state.json", {"last": now.isoformat(timespec="seconds"), "ran": ran})
    return ran


# ---- Hook Machine test: does the skeleton predict the 3-second hold? -------------------------------------------

MATCH_SCHEMA = {
    "type": "object",
    "properties": {"matches": {"type": "array", "items": {
        "type": "object", "properties": {"video_id": {"type": "string"}, "skeleton": {"type": "string"}},
        "required": ["video_id", "skeleton"], "additionalProperties": False}}},
    "required": ["matches"], "additionalProperties": False,
}


def spearman(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3:
        return None

    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2 + 1
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    sx = sum((a - mx) ** 2 for a in rx) ** 0.5
    sy = sum((b - my) ** 2 for b in ry) ** 0.5
    return round(cov / (sx * sy), 2) if sx and sy else None


def skeleton_check(job, channel_key: str, channel_id: str, count: int = 5, today=None) -> dict:
    sks = (skeletons(channel_key) or {}).get("skeletons", [])
    if not sks:
        raise StrategyError("Build skeletons in the Hook Machine first.")
    vids = [v for v in own_videos(channel_id, today, 20, job) if v["retention"]][:count]
    if not vids:
        raise StrategyError("No retention data on your recent videos yet.")
    m = _claude("Match each of the creator's videos to the hook skeleton its title or opening follows, "
                "or \"none\". Use the exact skeleton text.",
                "Skeletons:\n" + "\n".join(f"- {s['pattern']}" for s in sks) + "\n\nVideos:\n" +
                "\n".join(f"{v['id']} | {v['title']}" for v in vids), MATCH_SCHEMA, effort="low")
    by_pat = {s["pattern"]: s for s in sks}
    got = {x["video_id"]: x["skeleton"] for x in m.get("matches", [])}
    rows = []
    for v in vids:
        s = by_pat.get(got.get(v["id"], "none"))
        rows.append({"id": v["id"], "title": v["title"], "url": f"https://www.youtube.com/watch?v={v['id']}",
                     "skeleton": s["pattern"] if s else "none", "skeleton_score": s["median_score"] if s else None,
                     "hold_3s": v["hold_3s"], "exact": bool(v["duration"]) and v["duration"] / 100 <= 3,
                     "step_seconds": v["step_seconds"]})
    paired = [r for r in rows if r["skeleton_score"] is not None and r["hold_3s"] is not None]
    rho = spearman([r["skeleton_score"] for r in paired], [r["hold_3s"] for r in paired])
    return {"rows": rows, "rho": rho, "paired": len(paired),
            "note": "3-second hold is exact only for videos under 5 minutes; longer ones are read between "
                    "YouTube's 1% steps (shown per video)."}
