"""Pull preview frames with ffmpeg. Originals are only ever read, never written."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

WIDTH = 480


def _run(cmd: list[str]) -> bool:
    out = subprocess.run(cmd, capture_output=True, timeout=120)
    return out.returncode == 0


def frame_at(src: Path, t: float, out: Path, pre_filter: str | None = None, width: int = WIDTH) -> bool:
    """One frame at t seconds. pre_filter (e.g. the D-Log M LUT) runs before scaling."""
    vf = ",".join(f for f in (pre_filter, f"scale={width}:-2") if f)
    ok = _run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", str(src),
               "-frames:v", "1", "-vf", vf, "-q:v", "4", str(out)])
    if not ok:  # some files only decode from the start
        ok = _run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-ss", f"{t:.3f}",
                   "-frames:v", "1", "-vf", vf, "-q:v", "4", str(out)])
    return ok and out.exists()


def extract(src: Path, kind: str, duration: float | None, out_dir: Path, fid: str,
            pre_filter: str | None = None) -> list[str]:
    """Write preview images into out_dir and return their file names.

    Video: 3 frames at 15%, 50% and 85% of the clip, through pre_filter (the LUT) if given.
    Audio: 1 waveform image. Photo: 1 downscaled copy.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    names = []
    if kind == "video":
        d = duration or 1.0
        for i, frac in enumerate((0.15, 0.50, 0.85), start=1):
            t = max(0.0, min(d * frac, d - 0.05))
            name = f"{fid}_{i}.jpg"
            if frame_at(src, t, out_dir / name, pre_filter):
                names.append(name)
    elif kind == "audio":
        name = f"{fid}_1.png"
        if _run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-filter_complex",
                 f"aformat=channel_layouts=mono,showwavespic=s={WIDTH}x270:colors=#8C0532",
                 "-frames:v", "1", str(out_dir / name)]):
            names.append(name)
    elif kind == "photo":
        name = f"{fid}_1.jpg"
        ok = _run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-frames:v", "1",
                   "-vf", f"scale={WIDTH}:-2", "-q:v", "3", str(out_dir / name)])
        if not ok and shutil.which("sips"):  # HEIC on macOS
            ok = _run(["sips", "-s", "format", "jpeg", "-Z", str(WIDTH), str(src), "--out", str(out_dir / name)])
        if ok and (out_dir / name).exists():
            names.append(name)
    return names
