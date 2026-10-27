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


def path() -> Path | None:
    p = lut_dir() / FILE_NAME
    return p if p.is_file() else None


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


def install(text: str, original_name: str) -> dict:
    if len(text.encode()) > MAX_BYTES:
        raise LutError("That file is too big to be a LUT.")
    info = parse(text)
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
    return {"installed": True, "name": settings_mod.load().get("lut_name") or FILE_NAME,
            "size": info["size"], "title": info["title"]}


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
