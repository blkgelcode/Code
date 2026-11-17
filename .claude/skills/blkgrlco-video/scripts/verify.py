#!/usr/bin/env python3
"""Check a @blkgrlco video's deliverables against blkgrlco/RULES.md.

Usage: verify.py blkgrlco/videos/<slug> [--frames]

Reads <video>/manifest.json (paths relative to the video folder; LUT paths
relative to the repo), writes <video>/verify_report.md, and exits 1 if any
check FAILs. --frames extracts frames from each video deliverable into
<video>/media/verify_frames/ for QC's visual review (skin tones, cuts on
movement, captions, grid template, pillarboxing).

Only rules a script can check are checked here. The rest are QC's frame
and transcript review; the report lists them as MANUAL so nothing is
silently skipped.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
CONVERSION_LUT = "brand-bible/brands/assets/luts/dji-pocket3/DJI_OSMO_Pocket_3_D-Log_M_to_Rec.709_V1.cube"
CREATIVE_LUT = "brand-bible/brands/assets/luts/blkgrlco/The Everyday LUT.cube"
CREATIVE_LUT_DIRS = ("brand-bible/brands/assets/luts/blkgrlco/", "brand-bible/brands/assets/luts/blkgrlcotoo/")
CARD_RGB = (168, 177, 24)
SHORTS_MAX = 180.0
LONGFORM_TARGET = (12 * 60, 14 * 60)
TP_CEILING = -1.0
LUFS_RANGE = (-16.5, -13.5)
ROUTINE_HOLD = (2.5, 3.5)
TALKING_MAX = 20.0
RETIRED = ["the becoming", "comment your own rule"]
FLUB = re.compile(r"\b(lu(\s*lu)+|la[\s,.-]+la([\s,.-]+la)*)\b", re.I)
FILLER = re.compile(r"\b(um+|uh+|erm)\b", re.I)
BAD_OPEN = re.compile(r"hey (guys|y'all|everyone)|welcome back", re.I)
MANUAL = [
    ("P4", "skin tones natural (frames)"),
    ("C6", "cuts land on body movement, not camera repositioning"),
    ("C8/C9", "personality moments kept; every montage clip moves the story"),
    ("C10", "real transitional footage between locations"),
    ("C11", "ends cold; 'bye bye' kept if said"),
    ("C12", "matches her reference; nothing improvised"),
    ("G2", "4-panel timestamp grid on vertical daily vlogs"),
    ("A2", "her _tools/preflight.py run on the Mac"),
]

results = []


def record(rule, status, detail):
    results.append((rule, status, detail))


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(path):
    out = run(["ffprobe", "-v", "error", "-show_entries",
               "format=duration:stream=codec_type,width,height",
               "-of", "json", str(path)])
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        return None
    info = {"duration": float(data.get("format", {}).get("duration", 0) or 0)}
    for s in data.get("streams", []):
        if s.get("codec_type") == "video" and "width" not in info:
            info["width"], info["height"] = s.get("width"), s.get("height")
        if s.get("codec_type") == "audio":
            info["audio"] = True
    return info


def loudness(path):
    err = run(["ffmpeg", "-nostats", "-hide_banner", "-i", str(path), "-vn",
               "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    summary = err[err.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", summary)
    tp = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summary)
    return (float(i.group(1)) if i else None,
            float(tp.group(1)) if tp and tp.group(1) != "-inf" else None)


def pillarbox(path, duration):
    """Return the largest active-picture (width, height) cropdetect finds, or None."""
    err = run(["ffmpeg", "-hide_banner", "-ss", str(max(duration * 0.1, 0)),
               "-i", str(path), "-t", str(min(10, max(duration * 0.8, 1))),
               "-vf", "fps=2,cropdetect=limit=24:round=2:reset=1",
               "-f", "null", "-"]).stderr
    boxes = [(int(w), int(h)) for w, h in re.findall(r"crop=(\d+):(\d+):\d+:\d+", err)]
    if not boxes:
        return None
    return max(b[0] for b in boxes), max(b[1] for b in boxes)


def text_of(path):
    try:
        return Path(path).read_text(errors="ignore")
    except OSError:
        return ""


def check_transcript(rule_prefix, path, vtype):
    text = text_of(path)
    if not text.strip():
        record("C1-C5", "WARN", f"{rule_prefix}: no transcript at {path}; word checks skipped")
        return
    words = text.strip()
    flubs = FLUB.findall(words)
    record("C5", "FAIL" if flubs else "PASS",
           f"{rule_prefix}: flub marker in transcript" if flubs else f"{rule_prefix}: no lululu/la-la-la")
    n_fill = len(FILLER.findall(words))
    record("C4", "WARN" if n_fill else "PASS", f"{rule_prefix}: {n_fill} um/uh left in transcript")
    head = " ".join(words.split()[:25])
    if BAD_OPEN.search(head):
        record("C2", "FAIL", f"{rule_prefix}: opens with 'hey guys'/'welcome back': \"{head[:80]}…\"")
    if vtype in ("daily_vlog",) and "good morning" not in head.lower():
        record("C1", "FAIL", f"{rule_prefix}: daily vlog doesn't open on 'good morning': \"{head[:80]}…\"")
    for term in RETIRED:
        if term in words.lower():
            record("T6", "FAIL", f"{rule_prefix}: retired term '{term}' is spoken")


def check_video(d, base, vtype, frames):
    path = base / d["path"]
    if not path.exists():
        record("deliverable", "FAIL", f"{d['id']}: missing {d['path']}")
        return
    if "_TEMP" in path.name:
        record("VO", "FAIL", f"{d['id']}: {path.name} is a TEMP file (placeholder content), not a master")
    info = probe(path)
    if not info:
        record("deliverable", "FAIL", f"{d['id']}: ffprobe can't read {d['path']}")
        return
    kind = d.get("kind")
    dur = info["duration"]
    w, h = info.get("width"), info.get("height")
    if kind in ("vertical", "shorts"):
        ok = (w, h) == (1080, 1920)
        record("P1", "PASS" if ok else "FAIL", f"{d['id']}: {w}×{h}, {dur:.1f}s")
        active = pillarbox(path, dur)
        if active is not None and w and h and (active[0] < w * 0.9 or active[1] < h * 0.9):
            record("P1", "FAIL", f"{d['id']}: picture fills only {active[0]}×{active[1]} of {w}×{h}: "
                   "black bars (landscape boxed into vertical)")
    else:
        record("P1", "PASS", f"{d['id']}: long-form {w}×{h}, {dur:.1f}s (vertical rule n/a)")
        lo, hi = LONGFORM_TARGET
        if vtype == "sunday_vlog" and not lo <= dur <= hi:
            record("L1", "WARN", f"{d['id']}: {dur/60:.1f} min, target 12–14 (longer needs retention hooks)")
    if kind == "shorts":
        record("S1", "PASS" if dur < SHORTS_MAX else "FAIL", f"{d['id']}: {dur:.1f}s (must be < 180s)")
    if info.get("audio"):
        i, tp = loudness(path)
        lo, hi = LUFS_RANGE
        msg = f"{d['id']}: {i} LUFS, true peak {tp} dBTP (no locked target; default −14 to −16, ≤ −1 dBTP)"
        bad = (i is None or not lo <= i <= hi) or (tp is not None and tp > TP_CEILING)
        record("level", "WARN" if bad else "PASS", msg)
    if d.get("transcript"):
        check_transcript(d["id"], base / d["transcript"], vtype)
    if d.get("captions") and not (base / d["captions"]).exists():
        record("captions", "WARN", f"{d['id']}: no captions file at {d['captions']}")
    if frames:
        out = base / "media" / "verify_frames"
        out.mkdir(parents=True, exist_ok=True)
        n = 8
        for k in range(n):
            t = dur * (k + 0.5) / n
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(path),
                 "-frames:v", "1", "-vf", "scale=-2:720", str(out / f"{d['id']}_{k:02d}.jpg")])
        record("frames", "INFO", f"{d['id']}: {n} frames in media/verify_frames/ for QC")


def check_thumbnail(d, base, titles_text):
    path = base / d["path"]
    if not path.exists():
        record("T3", "FAIL", f"{d['id']}: missing {d['path']}")
        return
    if d.get("ai_generated") is not False:
        record("T1", "FAIL", f"{d['id']}: manifest must state ai_generated: false (no AI thumbnails)")
    else:
        record("T1", "PASS", f"{d['id']}: declared real footage" +
               (f" ({d['source_frame']})" if d.get("source_frame") else " — add source_frame"))
    info = probe(path)
    want = tuple(d.get("size") or ())
    got = (info.get("width"), info.get("height")) if info else None
    if want:
        record("T3", "PASS" if got == want else "FAIL", f"{d['id']}: {got} (want {want})")
    elif got not in ((1280, 720), (1080, 1920)):
        record("T3", "FAIL", f"{d['id']}: {got}, expected 1280×720 or 1080×1920")
    text = (d.get("text") or "").strip().lower()
    if text and titles_text:
        tw = [w for w in re.findall(r"[a-z0-9']+", text) if len(w) > 3]
        shared = [w for w in tw if w in titles_text.lower()]
        if tw and len(shared) / len(tw) >= 0.6:
            record("T4", "WARN", f"{d['id']}: thumbnail text \"{text}\" largely repeats the titles ({', '.join(shared)})")


def check_cards(base, cards_dir):
    folder = base / cards_dir
    cards = sorted(folder.glob("*.png")) if folder.exists() else []
    if not cards:
        record("G1", "WARN", f"no label cards in {cards_dir} (every scene change needs one)")
        return
    try:
        from PIL import Image
    except ImportError:
        record("G1", "WARN", "Pillow not installed; card pixels not checked (pip install pillow)")
        Image = None
    for c in cards:
        if not re.fullmatch(r"l_[a-z0-9_]+(_TEMP)?\.png", c.name):
            record("G1", "FAIL", f"{c.name}: name must be l_<name>.png, lowercase")
        if c.name.endswith("_TEMP.png"):
            record("G1", "WARN", f"{c.name}: TEMP render (Arial Rounded Bold missing here); re-render on the Mac")
        if Image is None:
            continue
        im = Image.open(c)
        problems = []
        if im.size != (1920, 1080):
            problems.append(f"size {im.size}")
        if im.mode != "RGBA":
            problems.append(f"mode {im.mode}, needs transparency")
        else:
            raw = im.tobytes()
            opaque = [raw[k:k + 3] for k in range(0, len(raw), 4) if raw[k + 3] > 200]
            if not opaque:
                problems.append("no visible text")
            else:
                near = sum(1 for p in opaque if all(abs(a - b) <= 6 for a, b in zip(p, CARD_RGB)))
                if near / len(opaque) < 0.8:
                    problems.append("text isn't #A8B118")
        record("G1", "FAIL" if problems else "PASS", f"{c.name}: " + ("; ".join(problems) or "1920×1080, transparent, #A8B118"))


def check_color(base, m):
    color = m.get("color") or {}
    conv, crea = color.get("conversion_lut"), color.get("creative_lut")
    if not conv:
        record("P2", "FAIL", "manifest color.conversion_lut not set")
    elif any(conv.startswith(p) for p in CREATIVE_LUT_DIRS):
        record("P2", "FAIL", f"a creative LUT is set as the conversion step: {conv}")
    elif conv != CONVERSION_LUT:
        record("P2", "WARN", f"conversion LUT isn't the repo's DJI file: {conv}")
    else:
        record("P2", "PASS", "conversion: DJI D-Log M → Rec.709")
    if crea != CREATIVE_LUT:
        record("P2", "FAIL", f"creative LUT should be The Everyday LUT, got {crea}")
    else:
        record("P2", "PASS", "creative: The Everyday LUT, after conversion")
    for p in (conv, crea):
        if p and not (REPO / p).exists():
            record("P2", "FAIL", f"LUT file missing: {p}")
    graded = base / color.get("graded_dir", "media/graded")
    if not any(graded.glob("*")) if graded.exists() else True:
        record("P2", "WARN", f"no graded working files in {graded.relative_to(base)}")


def check_shots(m, vtype):
    shots = m.get("shots") or []
    if not shots:
        record("C7/L3", "WARN", "manifest has no shot map; shot-length checks skipped")
        return
    for s in shots:
        length = s["end"] - s["start"]
        if s.get("kind") == "routine" and not ROUTINE_HOLD[0] - 0.05 <= length <= ROUTINE_HOLD[1] + 0.05:
            record("C7", "WARN", f"routine shot {s['start']:.1f}–{s['end']:.1f}s holds {length:.1f}s (2.5–3.5)")
        if s.get("kind") == "talking" and length > TALKING_MAX and vtype in ("sunday_vlog", "series_episode", "explainer"):
            record("L3", "FAIL", f"talking head {s['start']:.1f}–{s['end']:.1f}s runs {length:.0f}s with no B-roll (>20s)")


def check_copy(base, m, vtype):
    copy = m.get("copy") or {}
    alltext = ""
    for key, rel in copy.items():
        alltext += "\n" + text_of(base / rel)
    for p in (base / "copy").glob("*.md") if (base / "copy").exists() else []:
        alltext += "\n" + text_of(p)
    for term in RETIRED:
        if term in alltext.lower():
            record("T6", "FAIL", f"retired term '{term}' appears in copy/")
    desc = text_of(base / copy.get("description", "copy/description.md"))
    has_long = any(d.get("kind") == "longform" for d in m.get("deliverables", []))
    if has_long:
        ok = bool(re.search(r"^\s*0?0:00\b", desc, re.M))
        record("L5", "PASS" if ok else "FAIL", "chapters in description" if ok else "description has no chapters starting 00:00")
    if (m.get("series") or "").lower().startswith("90-day") and "pin board" not in alltext.lower():
        record("T6", "WARN", "90-Day HHH Run copy doesn't carry the locked CTA 'make your own Pin Board' — flag to her if intentional")
    return text_of(base / copy.get("titles", "copy/titles.md"))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    frames = "--frames" in sys.argv
    if not args:
        sys.exit(__doc__)
    base = Path(args[0]).resolve()
    m = json.loads((base / "manifest.json").read_text())
    vtype = m.get("type") or ""
    if not vtype:
        record("spec", "WARN", "manifest type not set (daily_short | daily_vlog | sunday_vlog | series_episode | explainer)")
    if not m.get("reference"):
        record("C12", "WARN", "no reference recorded in manifest (ask her before cutting a new format)")
    if not m.get("music"):
        record("D1", "WARN", "no pre-picked music recorded (music is chosen before shooting — ask, don't pick)")

    check_color(base, m)
    titles = check_copy(base, m, vtype)
    kinds = [d.get("kind") for d in m.get("deliverables", [])]
    if any(k in ("vertical", "longform") for k in kinds) and "shorts" not in kinds:
        record("S1", "FAIL", "no Shorts cut in deliverables (always delivered alongside the master)")
    for d in m.get("deliverables", []):
        if d.get("kind") == "thumbnail":
            check_thumbnail(d, base, titles)
        else:
            check_video(d, base, vtype, frames)
    check_cards(base, m.get("cards_dir", "media/assets/cards"))
    check_shots(m, vtype)
    pre = REPO / (m.get("preflight") or "_tools/preflight.py")
    if pre.exists():
        r = run([sys.executable, str(pre), str(base)])
        record("A2", "PASS" if r.returncode == 0 else "FAIL", f"preflight.py exit {r.returncode}: {(r.stdout + r.stderr).strip()[-300:]}")
    else:
        record("A2", "WARN", "her _tools/preflight.py isn't in this session — she runs it on the Mac before calling it final")
    for rule, what in MANUAL:
        record(rule, "MANUAL", what)

    fails = [r for r in results if r[1] == "FAIL"]
    warns = [r for r in results if r[1] == "WARN"]
    lines = [f"# Verify report — {base.name}", "",
             f"**{len(fails)} FAIL · {len(warns)} WARN** "
             f"({'not ready' if fails else 'no automated FAILs; QC still reviews the MANUAL rows'})", "",
             "| Rule | Status | Detail |", "|---|---|---|"]
    order = {"FAIL": 0, "WARN": 1, "PASS": 2, "INFO": 3, "MANUAL": 4}
    for rule, status, detail in sorted(results, key=lambda r: order.get(r[1], 9)):
        lines.append(f"| {rule} | {status} | {detail.replace('|', '/')} |")
    (base / "verify_report.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
