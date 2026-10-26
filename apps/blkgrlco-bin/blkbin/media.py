"""Find media files in a project folder and read their details with ffprobe."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".mts", ".webm"}
AUDIO_EXT = {".wav", ".mp3", ".m4a", ".aac", ".aif", ".aiff", ".flac", ".ogg", ".caf"}
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".dng", ".webp", ".tif", ".tiff"}

# Folders the app owns or that never hold footage to sort.
SKIP_DIRS = {"_proxies", ".blkgrlco-bin", ".Spotlight-V100", ".Trashes", ".fseventsd"}

DJI_RE = re.compile(r"^DJI_(\d{4})(\d{2})(\d{2})(\d{6})_(\d{4})_D", re.I)
IPHONE_RE = re.compile(r"^IMG_\d{4}", re.I)
SCREEN_RE = re.compile(r"(RPReplay|ScreenRecording|Screen Recording|Screenshot)", re.I)


def kind_of(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in PHOTO_EXT:
        return "photo"
    return None


def scan(root: Path) -> list[Path]:
    """Every media file under root, skipping macOS junk (._ files) and app folders."""
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS)
        for name in sorted(filenames):
            if name.startswith("."):
                continue
            p = Path(dirpath) / name
            if kind_of(p) and p.is_file():
                found.append(p)
    return found


def fingerprint(path: Path) -> str:
    """Stable id that survives renames and remounts: size + first and last MiB."""
    size = path.stat().st_size
    h = hashlib.sha1(str(size).encode())
    with open(path, "rb") as f:
        h.update(f.read(1 << 20))
        if size > 2 << 20:
            f.seek(-(1 << 20), os.SEEK_END)
            h.update(f.read(1 << 20))
    return h.hexdigest()[:16]


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe couldn't read this file: {out.stderr.strip()[:200]}")
    data = json.loads(out.stdout or "{}")
    fmt = data.get("format", {})
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"
                  and not s.get("disposition", {}).get("attached_pic")), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    tags = {}
    for source in [fmt.get("tags", {})] + [s.get("tags", {}) for s in streams]:
        for k, v in (source or {}).items():
            tags.setdefault(k.lower(), v)

    width = height = None
    rotation = 0
    if video:
        width, height = video.get("width"), video.get("height")
        rotation = _rotation(video)
        if rotation in (90, 270) and width and height:
            width, height = height, width
    duration = _float(fmt.get("duration")) or _float((video or audio or {}).get("duration"))
    fps = None
    if video and video.get("avg_frame_rate", "0/0") != "0/0":
        num, den = video["avg_frame_rate"].split("/")
        fps = round(float(num) / float(den), 2) if float(den) else None
    return {
        "duration": duration,
        "width": width,
        "height": height,
        "rotation": rotation,
        "fps": fps,
        "video_codec": (video or {}).get("codec_name"),
        "audio_codec": (audio or {}).get("codec_name"),
        "has_video": video is not None,
        "has_audio": audio is not None,
        "color_transfer": (video or {}).get("color_transfer"),
        "tags": {k: v for k, v in tags.items() if isinstance(v, str) and len(v) < 200},
    }


def _rotation(stream: dict) -> int:
    rot = stream.get("tags", {}).get("rotate")
    for side in stream.get("side_data_list", []) or []:
        if "rotation" in side:
            rot = side["rotation"]
    try:
        return int(float(rot or 0)) % 360
    except ValueError:
        return 0


def _float(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def orientation(info: dict) -> str | None:
    w, h = info.get("width"), info.get("height")
    if not w or not h:
        return None
    if abs(w - h) < 0.05 * max(w, h):
        return "square"
    return "vertical" if h > w else "horizontal"


def device(path: Path, info: dict) -> str:
    name = path.name
    tags = info.get("tags", {})
    model = tags.get("com.apple.quicktime.model") or tags.get("model")
    make = (tags.get("com.apple.quicktime.make") or tags.get("make") or "").lower()
    if DJI_RE.match(name):
        return "DJI Osmo Pocket 3"
    if any("dji" in str(v).lower() for v in tags.values()):
        return "DJI"
    if SCREEN_RE.search(name):
        return "Screen recording"
    if model and "iphone" in model.lower():
        return model
    if make == "apple" or IPHONE_RE.match(name):
        return "iPhone"
    if name.upper().startswith("ES_"):
        return "Epidemic Sound"
    return "Unknown"


def shot_date(path: Path, info: dict) -> str:
    """YYYY-MM-DD in local time: filename, then camera metadata, then file mtime."""
    m = DJI_RE.match(path.name)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    tags = info.get("tags", {})
    apple = tags.get("com.apple.quicktime.creationdate")
    if apple and re.match(r"\d{4}-\d{2}-\d{2}", apple):
        return apple[:10]  # already in the phone's local time
    exif = _exif_date(path)
    if exif:
        return exif
    created = tags.get("creation_time")
    if created:
        try:
            when = dt.datetime.fromisoformat(created.replace("Z", "+00:00"))
            if when.year > 1990:
                return when.astimezone().date().isoformat()
        except ValueError:
            pass
    return dt.date.fromtimestamp(path.stat().st_mtime).isoformat()


def _exif_date(path: Path) -> str | None:
    if kind_of(path) != "photo":
        return None
    try:
        from PIL import Image
        with Image.open(path) as im:
            exif = im.getexif()
            raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)
        if raw and re.match(r"\d{4}:\d{2}:\d{2}", raw):
            return raw[:10].replace(":", "-")
    except Exception:
        return None
    return None


def human_size(n: int) -> str:
    size = float(n)
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1000 or unit == "GB":
            return f"{size:.0f} {unit}" if unit in ("B", "KB") else f"{size:.1f} {unit}"
        size /= 1000
    return f"{size:.1f} TB"


def human_duration(seconds: float | None) -> str:
    if seconds is None:
        return "—"
    s = int(round(seconds))
    h, rem = divmod(s, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
