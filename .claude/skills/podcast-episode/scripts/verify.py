#!/usr/bin/env python3
"""Check an episode's deliverables against podcast/RULES.md (R2-R7).

Usage: verify.py podcast/episodes/epNN [--frames]

Reads <episode>/manifest.json (paths relative to the episode folder),
writes <episode>/verify_report.md, and exits 1 if any check FAILs.
--frames also extracts caption-time frames from each vertical into
<episode>/media/verify_frames/ so the burned-in captions can be eyeballed.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

TARGET_LUFS = -16.0
LUFS_TOLERANCE = 0.5
TRUE_PEAK_CEILING = -1.0  # default ceiling, not a locked rule: WARN only
COLD_OPEN_SILENCE_DB = -60.0
MIN_RUN = 2  # shortest run of consecutive raw words that counts as hers
REPO = Path(__file__).resolve().parents[4]

results = []  # (rule, status, detail)


def record(rule, status, detail):
    results.append((rule, status, detail))


def ffmpeg_filter(path, afilter, start=None, end=None):
    cmd = ["ffmpeg", "-nostats", "-hide_banner"]
    if start is not None:
        cmd += ["-ss", str(start)]
    if end is not None:
        cmd += ["-to", str(end)]
    cmd += ["-i", str(path), "-vn", "-af", afilter, "-f", "null", "-"]
    return subprocess.run(cmd, capture_output=True, text=True).stderr


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True).stdout.strip()
    return float(out)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tokens(text):
    text = text.lower().replace("’", "'")
    return re.findall(r"[a-z0-9']+", text)


def srt_cues(path):
    """Return [(start_s, end_s, text)] from an SRT file."""
    cues = []
    blocks = re.split(r"\n\s*\n", Path(path).read_text(encoding="utf-8").strip())
    ts = r"(\d+):(\d+):(\d+)[,.](\d+)"
    for block in blocks:
        m = re.search(ts + r"\s*-->\s*" + ts, block)
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        text = block[m.end():].strip()
        cues.append((start, end, text))
    return cues


def uncovered_runs(raw, said):
    """Greedily cover `said` with runs that appear contiguously in `raw`.

    Trimming and reordering keep every word inside some run of her raw
    speech. A match must be at least MIN_RUN words long, so a paraphrase
    can't pass by reusing common words ("to", "and") one at a time.
    Returns the runs of `said` tokens that couldn't be matched.
    """
    raw_text = " " + " ".join(raw) + " "
    gaps, current, i = [], [], 0
    while i < len(said):
        # longest run starting at i that exists verbatim in raw
        best = 0
        lo, hi = 1, len(said) - i
        while lo <= hi:
            mid = (lo + hi) // 2
            if " " + " ".join(said[i:i + mid]) + " " in raw_text:
                best, lo = mid, mid + 1
            else:
                hi = mid - 1
        if best == 0 or (best < MIN_RUN and len(said) >= MIN_RUN):
            current.append(said[i])
            i += 1
        else:
            if current:
                gaps.append(current)
                current = []
            i += best
    if current:
        gaps.append(current)
    return gaps


def check_words(label, raw_tokens, text):
    gaps = uncovered_runs(raw_tokens, tokens(text))
    hard = [g for g in gaps if len(g) >= 2]
    soft = [g for g in gaps if len(g) == 1]
    if hard:
        shown = "; ".join('"' + " ".join(g) + '"' for g in gaps[:12])
        record("R6 her words only", "FAIL",
               f"{label}: words not in the raw recording: {shown}")
    elif soft:
        shown = ", ".join(g[0] for g in soft[:15])
        record("R6 her words only", "WARN",
               f"{label}: {len(soft)} single-word mismatch(es), likely transcription noise; listen to check: {shown}")
    else:
        record("R6 her words only", "PASS", f"{label}: every word traced to the raw recording")


def resources_block(md):
    lines = md.splitlines()
    for i, line in enumerate(lines):
        if re.match(r"^\s*(#+\s*)?(\*\*)?resources\b", line, re.I):
            block = [line]
            for nxt in lines[i + 1:]:
                if re.match(r"^\s*#+\s", nxt) or re.match(r"^\s*=+\s*$", nxt):
                    break
                block.append(nxt)
            return "\n".join(block).strip()
    return None


def norm_ws(s):
    return re.sub(r"\s+", " ", s).strip()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ep = Path(sys.argv[1]).resolve()
    want_frames = "--frames" in sys.argv
    m = json.loads((ep / "manifest.json").read_text())
    p = lambda rel: (ep / rel).resolve()

    deliverables = m.get("deliverables", [])
    if not deliverables:
        record("manifest", "FAIL", "no deliverables listed")

    # R2: loudness on every deliverable
    for d in deliverables:
        path = p(d["path"])
        if not path.exists():
            record("R2 −16 LUFS", "FAIL", f"{d['id']}: file missing ({d['path']})")
            continue
        log = ffmpeg_filter(path, "ebur128=peak=true")
        summary = log[log.rfind("Summary:"):]
        i = re.search(r"I:\s*(-?[\d.]+|-inf)\s*LUFS", summary)
        tp = re.search(r"Peak:\s*(-?[\d.]+|-inf)\s*dBFS", summary)
        if not i:
            record("R2 −16 LUFS", "FAIL", f"{d['id']}: could not measure loudness")
            continue
        lufs = float(i.group(1))
        ok = abs(lufs - TARGET_LUFS) <= LUFS_TOLERANCE
        record("R2 −16 LUFS", "PASS" if ok else "FAIL",
               f"{d['id']}: {lufs:.1f} LUFS integrated (target {TARGET_LUFS:.0f} ±{LUFS_TOLERANCE})")
        if tp and float(tp.group(1)) > TRUE_PEAK_CEILING:
            record("R2 −16 LUFS", "WARN",
                   f"{d['id']}: true peak {float(tp.group(1)):.1f} dBTP is above {TRUE_PEAK_CEILING} (default ceiling, not locked)")

    # R3: cold open music-free
    co = m.get("cold_open") or {}
    stem = m.get("music_stem")
    if co.get("end") is None:
        record("R3 cold open music-free", "FAIL", "cold_open.end not set in manifest")
    elif not stem or not p(stem).exists():
        record("R3 cold open music-free", "FAIL", "music_stem missing, so silence can't be proven")
    else:
        log = ffmpeg_filter(p(stem), "volumedetect", co.get("start", 0.0), co["end"])
        mv = re.search(r"max_volume:\s*(-?[\d.]+|-inf)\s*dB", log)
        peak = float("-inf") if not mv or mv.group(1) == "-inf" else float(mv.group(1))
        ok = peak < COLD_OPEN_SILENCE_DB
        record("R3 cold open music-free", "PASS" if ok else "FAIL",
               f"music bus peak {peak} dB over {co.get('start', 0.0)}–{co['end']}s (must be < {COLD_OPEN_SILENCE_DB} dB)")

    # R4: intro/outro identical across episodes
    lock_path = REPO / "podcast" / "locked.json"
    lock = json.loads(lock_path.read_text())
    for key, lock_key in (("theme_file", "theme"), ("intro_card", "intro_card"), ("outro_card", "outro_card")):
        rel = m.get(key)
        if not rel or not p(rel).exists():
            record("R4 consistent intro/outro", "FAIL", f"{key} missing ({rel})")
            continue
        digest = sha256(p(rel))
        locked = lock[lock_key].get("sha256")
        if locked is None:
            record("R4 consistent intro/outro", "WARN",
                   f"{key} not locked yet. On her sign-off, write sha256 {digest} to locked.json → {lock_key}")
        elif digest == locked:
            record("R4 consistent intro/outro", "PASS", f"{key} matches the lock")
        else:
            record("R4 consistent intro/outro", "FAIL", f"{key} differs from the locked file (sha256 {digest[:12]}…)")

    # R5 captions + R6 words-only
    raw_rel = m.get("raw_transcript")
    raw_tokens = tokens(p(raw_rel).read_text()) if raw_rel and p(raw_rel).exists() else None
    if raw_tokens is None:
        record("R6 her words only", "FAIL", "raw transcript missing, so nothing can be traced to her")
    for d in deliverables:
        if d["kind"] in ("video", "vertical"):
            cap = d.get("captions")
            if not cap or not p(cap).exists():
                record("R5 captions", "FAIL", f"{d['id']}: no captions file")
            else:
                cues = srt_cues(p(cap))
                if not cues:
                    record("R5 captions", "FAIL", f"{d['id']}: captions file has no cues")
                else:
                    path = p(d["path"])
                    detail = f"{d['id']}: {len(cues)} cues"
                    status = "PASS"
                    if path.exists():
                        dur = duration(path)
                        slack = max(15.0, 0.1 * dur)
                        if cues[-1][1] < dur - slack:
                            status = "FAIL"
                            detail += f", but they stop at {cues[-1][1]:.0f}s of {dur:.0f}s"
                        if d["kind"] == "vertical" and want_frames:
                            out = ep / "media" / "verify_frames"
                            out.mkdir(parents=True, exist_ok=True)
                            picks = [cues[0], cues[len(cues) // 2], cues[-1]]
                            for n, (s, e, _) in enumerate(picks):
                                subprocess.run(
                                    ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{(s + e) / 2:.2f}",
                                     "-i", str(path), "-frames:v", "1",
                                     str(out / f"{d['id']}_{n}.jpg")])
                            detail += f"; frames in media/verify_frames/{d['id']}_*.jpg; check the burned-in captions by eye"
                    record("R5 captions", status, detail)
                    if raw_tokens is not None:
                        check_words(f"{d['id']} captions", raw_tokens, " ".join(c[2] for c in cues))
        if raw_tokens is not None:
            t = d.get("transcript")
            if not t or not p(t).exists():
                record("R6 her words only", "FAIL", f"{d['id']}: no transcript to check")
            else:
                check_words(d["id"], raw_tokens, p(t).read_text())

    # R7: show notes reuse the blog post's resources block
    blog, notes = m.get("blog_post"), m.get("show_notes")
    if not blog or not p(blog).exists():
        record("R7 resources block", "FAIL", "blog post missing")
    elif not notes or not p(notes).exists():
        record("R7 resources block", "FAIL", "show notes missing")
    else:
        block = resources_block(p(blog).read_text())
        if block is None:
            record("R7 resources block", "FAIL", "blog post has no Resources block")
        elif "[" in block and "]" in block and re.search(r"\[[^\]]*(name|todo|tbd|here)[^\]]*\]", block, re.I):
            record("R7 resources block", "FAIL", "blog post's Resources block is still a placeholder")
        elif norm_ws(block) in norm_ws(p(notes).read_text()):
            record("R7 resources block", "PASS", "show notes contain the blog's Resources block verbatim")
        else:
            record("R7 resources block", "FAIL", "show notes don't contain the blog's Resources block verbatim")

    fails = [r for r in results if r[1] == "FAIL"]
    warns = [r for r in results if r[1] == "WARN"]
    lines = [f"# Ep {m.get('episode')} — verify report", "",
             f"**{'FAIL' if fails else 'PASS'}**: {len(fails)} fail, {len(warns)} warn, "
             f"{len(results) - len(fails) - len(warns)} pass", "",
             "| Rule | Status | Detail |", "|---|---|---|"]
    lines += [f"| {r} | {s} | {d.replace('|', '/')} |" for r, s, d in results]
    (ep / "verify_report.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
