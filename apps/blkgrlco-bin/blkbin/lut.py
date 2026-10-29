"""LUT FIRST: frames from DJI D-Log M clips are converted to Rec.709 before anyone looks at them.

The LUT ("DJI OSMO Pocket 3 D-Log M to Rec.709", a .cube file from DJI) is chosen once in
Settings → Analysis and copied into the app's folder. It's applied with ffmpeg's lut3d filter
to the preview frames only. Original clips are never changed.

DJI tags D-Log M clips as bt709, so the file's own color tag can't be trusted: every clip from
the Pocket 3 gets the LUT unless it's switched off on that clip's card.
"""
from __future__ import annotations

import re
from pathlib import Path

from . import settings as settings_mod

FILE_NAME = "dlogm-to-rec709.cube"
MAX_BYTES = 20 * 1024 * 1024


class LutError(Exception):
    pass


def lut_dir() -> Path:
    d = settings_mod.app_home() / "luts"
    d.mkdir(parents=True, exist_ok=True)
    return d


# DJI's conversion LUT, kept with the brand assets so a fresh install works without choosing it
BRAND_CONVERSION = (Path(__file__).resolve().parents[3] / "brand-bible" / "brands" / "assets" / "luts" / "dji-pocket3"
                    / "DJI_OSMO_Pocket_3_D-Log_M_to_Rec.709_V1.cube")


def path() -> Path | None:
    """The conversion LUT: the one chosen in Settings, else DJI's file from the brand assets."""
    p = lut_dir() / FILE_NAME
    if p.is_file():
        return p
    return BRAND_CONVERSION if BRAND_CONVERSION.is_file() else None


def parse(text: str) -> dict:
    """Check a .cube file: a 3D LUT with the right number of RGB rows."""
    size = None
    title = ""
    rows = 0
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key = line.split()[0].upper()
        if key == "TITLE":
            title = line[5:].strip().strip('"')
        elif key == "LUT_3D_SIZE":
            try:
                size = int(line.split()[1])
            except (IndexError, ValueError):
                raise LutError("The LUT_3D_SIZE line isn't readable.")
        elif key == "LUT_1D_SIZE":
            raise LutError("That's a 1D LUT. Use the 3D .cube file from DJI.")
        elif key in ("DOMAIN_MIN", "DOMAIN_MAX", "LUT_3D_INPUT_RANGE"):
            continue
        elif re.match(r"^[-+0-9.eE]", line):
            parts = line.split()
            if len(parts) != 3:
                raise LutError(f"Bad row in the LUT: {line[:40]}")
            try:
                [float(p) for p in parts]
            except ValueError:
                raise LutError(f"Bad row in the LUT: {line[:40]}")
            rows += 1
    if not size or size < 2 or size > 256:
        raise LutError("That isn't a 3D .cube LUT (no LUT_3D_SIZE line).")
    if rows != size ** 3:
        raise LutError(f"The LUT says {size}³ = {size ** 3} rows but has {rows}.")
    return {"size": size, "title": title, "rows": rows}


class NotAConversion(LutError):
    """The file doesn't say it's a log → Rec.709 conversion (likely a creative look)."""


# Checking the curve doesn't work: DJI's own D-Log M → Rec.709 LUT barely changes the mids (it
# mostly deepens the shadows), so it looks much like a creative grade. The file's name or header
# naming the log profile is the dependable sign.
LOG_WORDS = re.compile(r"d[-_ ]?log|log[-_ ]?m\b|s[-_ ]?log|v[-_ ]?log|c[-_ ]?log|f[-_ ]?log|n[-_ ]?log|\blog\b", re.I)


def says_conversion(text: str, name: str) -> bool:
    header = "\n".join(line for line in text.splitlines()[:40] if line.lstrip().startswith(("#", "TITLE")))
    return bool(LOG_WORDS.search(Path(name).stem.replace("_", " ")) or LOG_WORDS.search(header))


def install(text: str, original_name: str, force: bool = False) -> dict:
    if len(text.encode()) > MAX_BYTES:
        raise LutError("That file is too big to be a LUT.")
    parse(text)
    if not force and not says_conversion(text, original_name):
        raise NotAConversion(
            f"“{Path(original_name).name}” doesn't say it converts D-Log M (no “D-Log” or “Log” in its name or "
            "header), so it's probably a creative look. Step 1 needs DJI's “DJI OSMO Pocket 3 D-Log M to Rec.709” "
            "LUT. Creative looks go in step 2.")
    target = lut_dir() / FILE_NAME
    if target.exists():  # keep the one it replaces
        n = 1
        while (lut_dir() / f"replaced-{n}.cube").exists():
            n += 1
        target.replace(lut_dir() / f"replaced-{n}.cube")
    target.write_text(text)
    settings_mod.save({"lut_name": Path(original_name).name or FILE_NAME})
    return status()


def status() -> dict:
    p = path()
    if not p:
        return {"installed": False, "name": None}
    try:
        info = parse(p.read_text())
    except (OSError, LutError):
        return {"installed": False, "name": None, "error": "The saved LUT can't be read. Choose it again."}
    mine = p == lut_dir() / FILE_NAME
    return {"installed": True, "name": (settings_mod.load().get("lut_name") or FILE_NAME) if mine else p.name,
            "source": "yours" if mine else "brand assets", "size": info["size"], "title": info["title"]}


def is_log_device(device: str | None) -> bool:
    return bool(device) and device.startswith("DJI")


def wanted(entry: dict, device: str | None) -> bool:
    """Should this clip's frames get the LUT? The card's own switch wins."""
    if entry.get("kind") != "video":
        return False
    override = entry.get("lut_override")
    if override is not None:
        return bool(override)
    return is_log_device(device)


def _escape(p: Path) -> str:
    # ffmpeg reads filter options through two levels of escaping: the option value, then the graph
    s = str(p)
    for ch in "\\':":
        s = s.replace(ch, "\\" + ch)
    return "".join("\\" + ch if ch in "\\'[],;" else ch for ch in s)


def filter_for(p: Path | None = None) -> str | None:
    """The ffmpeg filter that applies the LUT, or None when no LUT is installed."""
    p = p or path()
    if not p:
        return None
    return f"lut3d=file={_escape(p)}:interp=tetrahedral"


# ---- step 2: the creative look (card thumbnails only) ------------------------------------------
# Brand pipeline: D-Log M → Rec.709 conversion first, then the channel's creative grade.
# Claude always analyzes the plain converted frames; the look is only for how cards look to her.

LOOK_CHANNELS = {"@blkgrlco": "blkgrlco", "@blkgrlcotoo": "blkgrlcotoo", "podcast": "podcast"}
BRAND_LOOKS = {  # used when she hasn't chosen one in Settings
    "@blkgrlco": Path(__file__).resolve().parents[3] / "brand-bible" / "brands" / "assets" / "luts" / "blkgrlco" / "The Everyday LUT.cube",
}


def _look_file(channel: str) -> Path:
    if channel not in LOOK_CHANNELS:
        raise LutError("Unknown channel.")
    return lut_dir() / "looks" / f"{LOOK_CHANNELS[channel]}.cube"


def look_path(channel: str | None) -> Path | None:
    """The creative look for a channel: hers from Settings, else the brand-bible default, else none.
    A look switched off in Settings stays off."""
    if channel not in LOOK_CHANNELS:
        return None
    if channel in (settings_mod.load().get("looks_off") or []):
        return None
    mine = _look_file(channel)
    if mine.is_file():
        return mine
    brand = BRAND_LOOKS.get(channel)
    return brand if brand and brand.is_file() else None


def install_look(channel: str, text: str, original_name: str) -> dict:
    if len(text.encode()) > MAX_BYTES:
        raise LutError("That file is too big to be a LUT.")
    parse(text)
    target = _look_file(channel)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():  # keep the one it replaces
        n = 1
        while target.with_name(f"{target.stem}.replaced-{n}.cube").exists():
            n += 1
        target.replace(target.with_name(f"{target.stem}.replaced-{n}.cube"))
    target.write_text(text)
    cfg = settings_mod.load()
    names = dict(cfg.get("look_names") or {})
    names[channel] = Path(original_name).name
    settings_mod.save({"look_names": names, "looks_off": [c for c in cfg.get("looks_off") or [] if c != channel]})
    return looks_status()


def set_look_on(channel: str, on: bool) -> dict:
    if channel not in LOOK_CHANNELS:
        raise LutError("Unknown channel.")
    off = [c for c in settings_mod.load().get("looks_off") or [] if c != channel]
    settings_mod.save({"looks_off": off if on else off + [channel]})
    return looks_status()


def looks_status() -> dict:
    cfg = settings_mod.load()
    out = {}
    for ch in LOOK_CHANNELS:
        p = look_path(ch)
        off = ch in (cfg.get("looks_off") or [])
        mine = _look_file(ch).is_file()
        brand = BRAND_LOOKS.get(ch)
        out[ch] = {"on": bool(p), "off": off,
                   "name": (cfg.get("look_names") or {}).get(ch, _look_file(ch).name) if mine
                   else brand.stem if brand and brand.is_file() else None,
                   "source": "yours" if mine else "brand bible" if brand and brand.is_file() else None}
    return out


def graded_frame(base: Path, look: Path, cache_dir: Path) -> Path:
    """The card thumbnail with the look on top of the (already converted) frame. Cached per look
    file, so choosing a new look regrades on the next view without re-analyzing anything."""
    import hashlib
    import subprocess
    st = look.stat()
    key = hashlib.sha1(f"{look}|{st.st_size}|{st.st_mtime_ns}".encode()).hexdigest()[:10]
    out = cache_dir / f"look-{key}" / base.name
    if out.is_file() and out.stat().st_mtime >= base.stat().st_mtime:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(f".{out.name}.part.jpg")
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(base), "-vf", f"{filter_for(look)},format=yuvj420p",
                        "-q:v", "3", str(tmp)], capture_output=True, timeout=60)
    if r.returncode != 0 or not tmp.exists():
        return base  # show the plain frame rather than nothing
    tmp.replace(out)
    return out
