"""FIX + PROXY.

Fix: a clip ffprobe can't read, or that won't decode, is re-encoded to a clean H.264 MP4 next
to the original, named <name>_fixed.mp4. The original stays exactly where and as it is.

Proxy: a 720p H.264 copy of each video in <project>/_proxies/, mirroring the project's folders,
for smooth editing. Make proxies after Submit, so they carry the final names.

Neither ever replaces a file: a taken name gets -2, -3, ...
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from . import media

PROXY_DIR = "_proxies"
_encoders: set | None = None


def _ffmpeg(args: list[str], timeout: int = 6 * 3600) -> subprocess.CompletedProcess:
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-v", "error", *args],
                          capture_output=True, text=True, timeout=timeout)


def decode_check(src: Path, duration: float | None) -> str | None:
    """None if the start and end of the video decode cleanly, else the reason."""
    spans = [["-t", "2"]]
    if duration and duration > 6:
        spans.append(["-sseof", "-2"])
    for span in spans:
        pre = span if span[0] == "-sseof" else []
        post = span if span[0] == "-t" else []
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-xerror", *pre, "-i", str(src),
                            "-map", "0:v:0", *post, "-f", "null", "-"], capture_output=True, text=True, timeout=300)
        # ffmpeg often exits 0 after decode errors, so any error line counts
        if r.returncode != 0 or r.stderr.strip():
            msg = (r.stderr.strip().splitlines() or ["decoder error"])[-1]
            return f"won't decode cleanly ({'end' if pre else 'start'} of clip): {msg[:160]}"
    return None


def _has_encoder(name: str) -> bool:
    global _encoders
    if _encoders is None:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True)
        _encoders = {line.split()[1] for line in r.stdout.splitlines() if line.startswith(" V") and len(line.split()) > 1}
    return name in _encoders


def _video_codec(fast: bool) -> list[str]:
    # The M1's hardware encoder is several times faster for proxies.
    if fast and sys.platform == "darwin" and _has_encoder("h264_videotoolbox"):
        return ["-c:v", "h264_videotoolbox", "-b:v", "5M"]
    return ["-c:v", "libx264", "-preset", "veryfast" if fast else "medium", "-crf", "23" if fast else "18"]


def free_path(path: Path) -> Path:
    from .submit import free_name
    return free_name(path, set())


def fix(src: Path) -> Path:
    """Re-encode a damaged clip to <stem>_fixed.mp4 beside it."""
    dst = free_path(src.with_name(f"{src.stem}_fixed.mp4"))
    part = dst.with_name(f".{dst.name}.part")
    args = ["-err_detect", "ignore_err", "-fflags", "+genpts+discardcorrupt", "-i", str(src),
            "-map", "0:v:0?", "-map", "0:a:0?", *_video_codec(fast=False), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-f", "mp4", str(part)]
    r = _ffmpeg(args)
    if r.returncode != 0 or not part.exists() or part.stat().st_size == 0:
        if part.exists():
            part.rename(free_path(dst.with_name(f"{dst.stem}.failed.mp4")))  # kept for a look, never deleted
        raise RuntimeError(f"ffmpeg couldn't rescue {src.name}: {(r.stderr.strip().splitlines() or ['no output'])[-1][:200]}")
    final = free_path(dst)
    part.rename(final)
    return final


def proxy_target(root: Path, rel: str) -> Path:
    p = Path(rel)
    return root / PROXY_DIR / p.parent / f"{p.stem}.mp4"


def make_proxy(src: Path, dst: Path) -> Path:
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst = free_path(dst)
    part = dst.with_name(f".{dst.name}.part")
    # short side 720 px (never upscaled), whatever the orientation (ffmpeg has already rotated it)
    scale = "scale=w='if(gt(iw,ih),-2,min(720,iw))':h='if(gt(iw,ih),min(720,ih),-2)'"
    r = _ffmpeg(["-i", str(src), "-map", "0:v:0", "-map", "0:a:0?", "-vf", scale, *_video_codec(fast=True),
                 "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-f", "mp4", str(part)])
    if r.returncode != 0 or not part.exists():
        raise RuntimeError(f"proxy failed for {src.name}: {(r.stderr.strip().splitlines() or ['no output'])[-1][:200]}")
    final = free_path(dst)
    part.rename(final)
    return final


def todo(project) -> dict:
    """What Fix + proxies would do right now."""
    fix_list, proxy_list = [], []
    for e in project.entries():
        if e["kind"] != "video" or Path(e["path"]).stem.endswith("_fixed"):
            continue
        if e.get("broken") and not e.get("fixed_path"):
            fix_list.append({"fid": e["fid"], "path": e["path"], "reason": e["broken"]})
        elif not e.get("broken"):
            px = e.get("proxy") or {}
            if px.get("for_path") != e["path"] or not (project.root / px.get("path", "\0")).exists():
                proxy_list.append({"fid": e["fid"], "path": e["path"],
                                   "to": project.rel(proxy_target(project.root, e["path"])),
                                   "stale": bool(px)})
    return {"fix": fix_list, "proxy": proxy_list}


def run(job, project, do_fix: bool = True, do_proxy: bool = True) -> dict:
    work = todo(project)
    items = ([("fix", x) for x in work["fix"]] if do_fix else []) + \
            ([("proxy", x) for x in work["proxy"]] if do_proxy else [])
    done, errors = [], []
    for i, (what, item) in enumerate(items):
        job.progress(i, len(items), f"{'Fixing' if what == 'fix' else 'Proxy for'} {Path(item['path']).name}")
        src = project.root / item["path"]
        try:
            if what == "fix":
                out = fix(src)
                with project.lock:
                    project.state["files"][item["fid"]]["fixed_path"] = project.rel(out)
                    project.save()
            else:
                out = make_proxy(src, proxy_target(project.root, item["path"]))
                with project.lock:
                    project.state["files"][item["fid"]]["proxy"] = {"path": project.rel(out), "for_path": item["path"]}
                    project.save()
            done.append({"what": what, "src": item["path"], "out": project.rel(out)})
        except Exception as exc:
            errors.append(f"{item['path']}: {exc}")
    job.progress(len(items), len(items), "Done")
    project.refresh()  # _fixed files become new cards
    return {"done": done, "errors": errors}


def ffmpeg_ok() -> bool:
    return bool(shutil.which("ffmpeg"))
