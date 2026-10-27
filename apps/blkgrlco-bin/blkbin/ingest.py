"""INGEST: copy a camera card (or a folder of phone footage) onto the T7, checksum every copy.

  card or folder  ──copy──▶  project hhh/<new project>/_raw/
                  ◀─verify─  SHA-256 of the source == SHA-256 read back from the T7

"Safe to wipe the card" appears only when every file matched. Nothing on the card is ever
deleted, moved or renamed: it's only read. On the T7 nothing is overwritten: a taken name gets
-2, and a file that's already there with the same checksum counts as copied.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

from . import media, settings as settings_mod

RAW = "_raw"
CHUNK = 4 << 20
SKIP_NAMES = {".Spotlight-V100", ".Trashes", ".fseventsd", ".TemporaryItems", "System Volume Information"}


class IngestError(Exception):
    pass


def _volumes_root() -> Path:
    return Path(os.environ.get("BLKBIN_VOLUMES", "/Volumes"))


def _files(src: Path) -> list[Path]:
    out = []
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and d not in SKIP_NAMES)
        for name in sorted(filenames):
            if name.startswith("."):  # ._ AppleDouble junk, .DS_Store
                continue
            p = Path(dirpath) / name
            if p.is_file() and not p.is_symlink():
                out.append(p)
    return out


def describe(src: Path) -> dict:
    files = _files(src)
    names = [p.name for p in files]
    dji = sum(bool(media.DJI_RE.match(n)) for n in names)
    iphone = sum(bool(media.IPHONE_RE.match(n)) for n in names)
    kind = "DJI" if dji and dji >= iphone else "iPhone" if iphone else "Camera"
    return {"path": str(src), "label": src.name, "device": kind, "files": len(files),
            "media": sum(1 for p in files if media.kind_of(p)), "bytes": sum(p.stat().st_size for p in files),
            "size": media.human_size(sum(p.stat().st_size for p in files))}


def sources() -> list[dict]:
    """Camera cards plugged in right now: any volume with a DCIM folder (not the T7 itself)."""
    root = _volumes_root()
    found = []
    if not root.is_dir():
        return found
    for vol in sorted(root.iterdir()):
        try:
            dcim = vol / "DCIM"
            if not dcim.is_dir() or (vol / "project hhh").exists():
                continue
            info = describe(dcim)
            if info["files"]:
                info["label"] = vol.name
                found.append(info)
        except OSError:
            continue
    return found


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        _no_cache(f)
        for chunk in iter(lambda: f.read(CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


def _no_cache(f) -> None:
    """On macOS, read the copy back from the drive itself, not from memory."""
    if sys.platform == "darwin":
        try:
            import fcntl
            fcntl.fcntl(f.fileno(), 48, 1)  # F_NOCACHE
        except OSError:
            pass


def check_destination(dest_root: Path, name: str) -> Path:
    if not dest_root.is_dir():
        raise IngestError(f"{dest_root} isn't there. Plug in the T7 (it mounts as Untitled).")
    clean = name.strip().replace("/", "-").replace(":", "-")
    if not clean or clean.startswith("."):
        raise IngestError("Give the new project a name.")
    return dest_root / clean


def plan(src: str, name: str, dest_root: str | None = None) -> dict:
    srcp = Path(src).expanduser()
    if not srcp.is_dir():
        raise IngestError(f"{src} isn't a folder.")
    root = Path(dest_root or settings_mod.load()["default_picker_location"]).expanduser()
    project = check_destination(root, name)
    if srcp.resolve() == project.resolve() or project.resolve() in srcp.resolve().parents:
        raise IngestError("The source is inside the destination. Pick the card, not the T7.")
    info = describe(srcp)
    if not info["files"]:
        raise IngestError("There are no files in that folder.")
    free = shutil.disk_usage(root).free
    if info["bytes"] * 1.02 > free:
        raise IngestError(f"Not enough space on the T7: need {media.human_size(info['bytes'])}, "
                          f"{media.human_size(free)} free.")
    return {**info, "project": str(project), "raw": str(project / RAW), "exists": project.exists()}


def run(job, src: str, name: str, dest_root: str | None = None) -> dict:
    p = plan(src, name, dest_root)
    srcp, project = Path(src).expanduser(), Path(p["project"])
    raw = project / RAW
    raw.mkdir(parents=True, exist_ok=True)
    from .submit import free_name
    files = _files(srcp)
    total_bytes = sum(f.stat().st_size for f in files) or 1
    rows, copied_bytes, claimed = [], 0, set()
    for i, f in enumerate(files):
        job.progress(copied_bytes, total_bytes, f"Copying {i + 1} of {len(files)}: {f.name}")
        row = {"source": str(f), "copy": "", "size": f.stat().st_size, "sha256_source": "", "sha256_copy": "",
               "result": ""}
        try:
            want = raw / f.name
            src_sha = None
            if want.exists() and want.stat().st_size == row["size"]:  # an earlier ingest of this card?
                src_sha, there_sha = _sha256(f), _sha256(want)
                if src_sha == there_sha:
                    row.update(copy=str(want), sha256_source=src_sha, sha256_copy=there_sha,
                               result="match (already copied)")
            if not row["result"]:
                dst = free_name(want, claimed)
                claimed.add(dst.as_posix().lower())
                part = dst.with_name(f".{dst.name}.part")
                h = hashlib.sha256()
                with open(f, "rb") as fin, open(part, "wb") as fout:
                    for chunk in iter(lambda: fin.read(CHUNK), b""):
                        h.update(chunk)
                        fout.write(chunk)
                    fout.flush()
                    os.fsync(fout.fileno())
                shutil.copystat(f, part)
                dst = free_name(dst, set())  # check again right before the rename: never overwrite
                os.rename(part, dst)
                row.update(copy=str(dst), sha256_source=h.hexdigest(), sha256_copy=_sha256(dst))
                row["result"] = "match" if row["sha256_copy"] == row["sha256_source"] else "MISMATCH"
        except OSError as exc:
            row["result"] = f"ERROR: {exc.strerror or exc}"
        rows.append(row)
        copied_bytes += row["size"]
    ok = bool(rows) and all(r["result"].startswith("match") for r in rows) and len(rows) == len(files)
    report = _write_report(project, srcp, rows, ok)
    job.progress(total_bytes, total_bytes, "Done")
    return {"project": str(project), "raw": str(raw), "files": len(rows),
            "matched": sum(r["result"].startswith("match") for r in rows),
            "problems": [r for r in rows if not r["result"].startswith("match")],
            "safe_to_wipe": ok, "report": report, "bytes": media.human_size(total_bytes)}


def _write_report(project: Path, src: Path, rows: list, ok: bool) -> str:
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    from .submit import free_name
    path = free_name(project / f"_ingest-report-{stamp}.csv", set())
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["source", "copy_on_t7", "bytes", "sha256_source", "sha256_copy", "result"])
        for r in rows:
            w.writerow([r["source"], r["copy"], r["size"], r["sha256_source"], r["sha256_copy"], r["result"]])
        w.writerow([])
        w.writerow([f"{sum(r['result'].startswith('match') for r in rows)} of {len(rows)} files match",
                    "SAFE TO WIPE THE CARD" if ok else "NOT safe to wipe: see the rows above"])
    state = project / ".blkgrlco-bin" / "ingest"
    state.mkdir(parents=True, exist_ok=True)
    (state / f"{stamp}.json").write_text(json.dumps({"source": str(src), "safe_to_wipe": ok, "rows": rows}, indent=1))
    return str(path)
