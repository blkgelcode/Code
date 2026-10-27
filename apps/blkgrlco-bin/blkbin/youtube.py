"""YouTube sign-in (OAuth for a desktop app) and channel analytics.

Setup, once: a Google Cloud project with the YouTube Data API v3 and YouTube Analytics API
turned on, an OAuth client of type "Desktop app", and its JSON saved in Settings.
Each channel (@blkgrlco, @blkgrlcotoo, the podcast) is signed in separately; Google asks
which channel when you sign in. Tokens stay in the app's folder on the Mac.

Standard library only (urllib). All network calls go through `_http`, which tests replace.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from . import settings as settings_mod

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
DATA_API = "https://www.googleapis.com/youtube/v3"
ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2/reports"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",  # earnings, if the channel has them
]

_lock = threading.RLock()
_pending: dict[str, dict] = {}   # OAuth state -> PKCE verifier, redirect, time
_cache: dict[tuple, tuple] = {}  # (channel, days) -> (time, result)
CACHE_SECONDS = 3600


class YouTubeError(Exception):
    pass


# ---- storage ----------------------------------------------------------------------

def _dir():
    d = settings_mod.app_home() / "youtube"
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


def _write_private(name: str, data) -> None:
    p = _dir() / name
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1))
    os.chmod(tmp, 0o600)
    tmp.replace(p)


def save_client(raw: str) -> dict:
    """Accept the JSON Google gives you for a Desktop OAuth client."""
    try:
        data = json.loads(raw)
    except ValueError:
        raise YouTubeError("That isn't the JSON file from Google. Download it again from the OAuth client page.")
    info = data.get("installed") or data.get("web") or data
    if not info.get("client_id") or not info.get("client_secret"):
        raise YouTubeError("That file has no client_id/client_secret. Use the OAuth client of type Desktop app.")
    _write_private("client.json", {"client_id": info["client_id"], "client_secret": info["client_secret"]})
    return status()


def client() -> dict | None:
    c = _read("client.json", None)
    return c if c and c.get("client_id") else None


def channels() -> dict:
    return _read("channels.json", {})


def status() -> dict:
    return {
        "client": bool(client()),
        "channels": [{"id": cid, "title": c.get("title"), "handle": c.get("handle"), "earnings": c.get("earnings")}
                     for cid, c in channels().items()],
    }


def disconnect(channel_id: str) -> dict:
    with _lock:
        chans = channels()
        chans.pop(channel_id, None)
        _write_private("channels.json", chans)
    return status()


# ---- HTTP ------------------------------------------------------------------------------

def _http(method: str, url: str, data: dict | None = None, headers: dict | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        try:
            err = json.loads(exc.read() or b"{}")
        except ValueError:
            err = {}
        raise YouTubeError(_explain(exc.code, err)) from None
    except urllib.error.URLError as exc:
        raise YouTubeError(f"Can't reach Google ({exc.reason}). Check the internet connection.") from None


def _explain(code: int, err: dict) -> str:
    e = err.get("error")
    msg = (e.get("message") if isinstance(e, dict) else err.get("error_description") or e) or ""
    if code == 401 or e == "invalid_grant":
        return "Google sign-in expired. Reconnect the channel in Settings → Connections."
    if code == 403 and "quota" in str(msg).lower():
        return "Today's YouTube API quota is used up. It resets at midnight Pacific."
    return f"YouTube said {code}: {str(msg)[:200]}"


# ---- OAuth (desktop app, loopback redirect, PKCE) --------------------------------------

def auth_url(redirect_uri: str) -> str:
    c = client()
    if not c:
        raise YouTubeError("Add your Google OAuth client first (Settings → Connections).")
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    with _lock:
        for k in [k for k, v in _pending.items() if time.time() - v["at"] > 900]:
            _pending.pop(k)
        _pending[state] = {"verifier": verifier, "redirect": redirect_uri, "at": time.time()}
    return AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": c["client_id"], "redirect_uri": redirect_uri, "response_type": "code",
        "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent select_account",
        "include_granted_scopes": "true", "state": state,
        "code_challenge": challenge, "code_challenge_method": "S256",
    })


def finish_auth(state: str, code: str) -> dict:
    with _lock:
        pending = _pending.pop(state, None)
    if not pending:
        raise YouTubeError("That sign-in link expired or didn't come from this app. Start again from Settings.")
    c = client()
    tok = _http("POST", TOKEN_URL, {
        "code": code, "client_id": c["client_id"], "client_secret": c["client_secret"],
        "redirect_uri": pending["redirect"], "grant_type": "authorization_code",
        "code_verifier": pending["verifier"],
    })
    if not tok.get("refresh_token"):
        raise YouTubeError("Google didn't send a long-lived token. Remove the app's access at "
                           "myaccount.google.com/permissions, then connect again.")
    token = {"access_token": tok["access_token"], "expires_at": time.time() + int(tok.get("expires_in", 3600)) - 60,
             "refresh_token": tok["refresh_token"], "scope": tok.get("scope", "")}
    me = _http("GET", f"{DATA_API}/channels?part=snippet,statistics&mine=true",
               headers={"Authorization": f"Bearer {token['access_token']}"})
    items = me.get("items") or []
    if not items:
        raise YouTubeError("That Google account has no YouTube channel. Pick the channel when Google asks.")
    ch = items[0]
    with _lock:
        chans = channels()
        chans[ch["id"]] = {"title": ch["snippet"]["title"], "handle": ch["snippet"].get("customUrl", ""),
                           "token": token, "connected": dt.datetime.now().isoformat(timespec="seconds")}
        _write_private("channels.json", chans)
    _cache.clear()
    return {"id": ch["id"], "title": ch["snippet"]["title"]}


def _access_token(channel_id: str) -> str:
    with _lock:
        chans = channels()
        ch = chans.get(channel_id)
        if not ch:
            raise YouTubeError("That channel isn't connected.")
        tok = ch["token"]
        if tok["expires_at"] > time.time():
            return tok["access_token"]
        c = client()
        new = _http("POST", TOKEN_URL, {"client_id": c["client_id"], "client_secret": c["client_secret"],
                                        "refresh_token": tok["refresh_token"], "grant_type": "refresh_token"})
        tok["access_token"] = new["access_token"]
        tok["expires_at"] = time.time() + int(new.get("expires_in", 3600)) - 60
        _write_private("channels.json", chans)
        return tok["access_token"]


def _get(channel_id: str, url: str) -> dict:
    return _http("GET", url, headers={"Authorization": f"Bearer {_access_token(channel_id)}"})


# ---- analytics ----------------------------------------------------------------------------

LAG_DAYS = 3  # YouTube Analytics is usually 2-3 days behind


def overview(channel_id: str, days: int, today: dt.date | None = None) -> dict:
    """Daily views, watch hours, subscribers and (if available) earnings for the last `days`
    days of finished data, plus the same span before it for comparison."""
    if days not in (7, 28):
        raise YouTubeError("Pick 7 or 28 days.")
    key = (channel_id, days)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    today = today or dt.date.today()
    end = today - dt.timedelta(days=LAG_DAYS)
    start = end - dt.timedelta(days=days - 1)
    prev_start = start - dt.timedelta(days=days)

    def report(metrics: str) -> dict:
        q = urllib.parse.urlencode({"ids": "channel==MINE", "startDate": prev_start.isoformat(),
                                    "endDate": end.isoformat(), "metrics": metrics, "dimensions": "day",
                                    "sort": "day"})
        return _get(channel_id, f"{ANALYTICS_API}?{q}")

    base = report("views,estimatedMinutesWatched,subscribersGained,subscribersLost")
    cols = [h["name"] for h in base.get("columnHeaders", [])]
    by_day = {row[0]: dict(zip(cols, row)) for row in base.get("rows", [])}

    earnings, earnings_note = None, ""
    chans = channels()
    if chans.get(channel_id, {}).get("earnings") is not False:
        try:
            rev = report("estimatedRevenue")
            earnings = {row[0]: row[1] for row in rev.get("rows", [])}
            _set_earnings(channel_id, True)
        except YouTubeError as exc:
            earnings_note = "Not available for this channel (it isn't in the YouTube Partner Program, or the permission wasn't granted)."
            if "403" in str(exc):
                _set_earnings(channel_id, False)
    else:
        earnings_note = "Not available for this channel."

    days_list = [prev_start + dt.timedelta(days=i) for i in range(days * 2)]
    series = {"views": [], "watch_hours": [], "subscribers": [], "earnings": []}
    for d in days_list:
        r = by_day.get(d.isoformat(), {})
        series["views"].append(int(r.get("views", 0) or 0))
        series["watch_hours"].append(round((r.get("estimatedMinutesWatched", 0) or 0) / 60, 1))
        series["subscribers"].append(int(r.get("subscribersGained", 0) or 0) - int(r.get("subscribersLost", 0) or 0))
        series["earnings"].append(round(float(earnings.get(d.isoformat(), 0) or 0), 2) if earnings is not None else None)

    stats = _get(channel_id, f"{DATA_API}/channels?part=statistics&id={channel_id}").get("items", [{}])[0].get("statistics", {})

    def split(vals):
        return vals[days:], vals[:days]

    metrics = {}
    for name, vals in series.items():
        if name == "earnings" and earnings is None:
            metrics[name] = {"available": False, "note": earnings_note}
            continue
        cur, prev = split(vals)
        total, prev_total = round(sum(cur), 2), round(sum(prev), 2)
        metrics[name] = {"available": True, "daily": cur, "previous_daily": prev, "total": total,
                         "previous_total": prev_total,
                         "change": round((total - prev_total) / prev_total, 3) if prev_total else None}
    if not stats.get("hiddenSubscriberCount"):
        metrics["subscribers"]["current_total"] = int(stats.get("subscriberCount", 0) or 0)
    result = {"channel_id": channel_id, "title": chans.get(channel_id, {}).get("title"), "days": days,
              "start": start.isoformat(), "end": end.isoformat(),
              "dates": [d.isoformat() for d in days_list[days:]], "metrics": metrics}
    _cache[key] = (time.time(), result)
    return result


def _set_earnings(channel_id: str, value: bool) -> None:
    with _lock:
        chans = channels()
        if channel_id in chans and chans[channel_id].get("earnings") != value:
            chans[channel_id]["earnings"] = value
            _write_private("channels.json", chans)


# ---- videos and retention (Phase 4 retention loop, Phase 5 strategy) ---------------------------

def parse_duration(iso: str) -> int:
    """ISO 8601 duration (PT1H2M3S) to seconds."""
    import re
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def api_channel(prefer: str | None = None) -> str:
    """A connected channel whose sign-in can be used for public lookups."""
    chans = channels()
    if not chans:
        raise YouTubeError("Connect a YouTube channel first (Settings → Connections).")
    if prefer:
        for cid, c in chans.items():
            if cid == prefer or (c.get("handle") or "").lower() == prefer.lower():
                return cid
    return next(iter(chans))


def data(path: str, params: dict, prefer: str | None = None) -> dict:
    """GET a YouTube Data API endpoint with a connected channel's sign-in."""
    cid = api_channel(prefer)
    return _get(cid, f"{DATA_API}/{path}?{urllib.parse.urlencode(params)}")


def videos(ids: list[str], prefer: str | None = None) -> list[dict]:
    out = []
    for i in range(0, len(ids), 50):
        r = data("videos", {"part": "snippet,contentDetails,statistics", "id": ",".join(ids[i:i + 50]),
                            "maxResults": 50}, prefer)
        for v in r.get("items", []):
            sn, st = v.get("snippet", {}), v.get("statistics", {})
            thumbs = sn.get("thumbnails", {})
            out.append({
                "id": v["id"], "channel_id": sn.get("channelId"), "channel": sn.get("channelTitle"),
                "title": sn.get("title", ""), "description": (sn.get("description") or "")[:1500],
                "published": sn.get("publishedAt"), "duration": parse_duration(v.get("contentDetails", {}).get("duration")),
                "views": int(st.get("viewCount", 0) or 0), "likes": int(st.get("likeCount", 0) or 0),
                "comments": int(st.get("commentCount", 0) or 0),
                "thumbnail": (thumbs.get("medium") or thumbs.get("high") or thumbs.get("default") or {}).get("url"),
            })
    return out


def video_info(video_id: str) -> dict:
    found = videos([video_id])
    if not found:
        raise YouTubeError("YouTube doesn't know that video. Check the link.")
    return found[0]


def channel_uploads(channel_id: str, limit: int = 50, prefer: str | None = None) -> list[dict]:
    """A channel's most recent uploads, newest first, with stats."""
    ch = data("channels", {"part": "contentDetails", "id": channel_id}, prefer).get("items", [])
    if not ch:
        return []
    playlist = ch[0]["contentDetails"]["relatedPlaylists"]["uploads"]
    ids, token = [], None
    while len(ids) < limit:
        params = {"part": "contentDetails", "playlistId": playlist, "maxResults": min(50, limit - len(ids))}
        if token:
            params["pageToken"] = token
        page = data("playlistItems", params, prefer)
        ids += [it["contentDetails"]["videoId"] for it in page.get("items", [])]
        token = page.get("nextPageToken")
        if not token:
            break
    vids = {v["id"]: v for v in videos(ids, prefer)}
    return [vids[i] for i in ids if i in vids]


def retention(channel_id: str, video_id: str, start: str, end: str) -> list[list[float]]:
    """Audience retention: [elapsed ratio, share of viewers still watching, relative to similar videos].
    YouTube reports it in steps of 1% of the video's length."""
    q = urllib.parse.urlencode({"ids": "channel==MINE", "startDate": start, "endDate": end,
                                "metrics": "audienceWatchRatio,relativeRetentionPerformance",
                                "dimensions": "elapsedVideoTimeRatio", "filters": f"video=={video_id}",
                                "sort": "elapsedVideoTimeRatio"})
    rows = _get(channel_id, f"{ANALYTICS_API}?{q}").get("rows") or []
    return [[float(r[0]), float(r[1]), float(r[2]) if len(r) > 2 and r[2] is not None else None] for r in rows]


def hold_at(points: list[list[float]], seconds: float, duration: float) -> float | None:
    """Share of viewers still watching at `seconds`, interpolated between YouTube's 1% steps."""
    if not points or not duration or seconds > duration:
        return None
    x = seconds / duration
    pts = sorted(points)
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0, *_), (x1, y1, *_) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * ((x - x0) / (x1 - x0) if x1 > x0 else 0)
    return pts[-1][1]
