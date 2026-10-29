"""Command-line tools, used by run-tests.command.

  python -m blkbin.cli copy     SRC DEST        copy a folder for testing (never overwrites)
  python -m blkbin.cli analyze  FOLDER          analyze every file (waits until done)
  python -m blkbin.cli plan     FOLDER          print the dry run
  python -m blkbin.cli apply    FOLDER --yes    apply the dry run
  python -m blkbin.cli undo     FOLDER          undo the last submit
  python -m blkbin.cli snapshot FOLDER OUT.tsv  file listing with checksums
  python -m blkbin.cli compare  A.tsv B.tsv     are two listings identical?
  python -m blkbin.cli labels-template FOLDER OUT.csv
  python -m blkbin.cli accuracy FOLDER LABELS.csv
  python -m blkbin.cli score-ab AB_FOLDER        does the app's #1 thumbnail match the real winner?
  python -m blkbin.cli ingest   SRC NAME --dest D copy a card into D/NAME/_raw with checksums
  python -m blkbin.cli fix-proxy FOLDER         rescue broken clips + make 720p proxies
  python -m blkbin.cli lut-compare CLIP OUT.jpg  one frame: D-Log M | converted | + the channel's creative look
  python -m blkbin.cli flubmap  CLIP            print a clip's flub & silence map to check by ear
  python -m blkbin.cli retention                pull any due retention curves, print what loses viewers
  python -m blkbin.cli bullseye @CHANNEL        run the Audience Bullseye, print the top 10 topics
  python -m blkbin.cli skeleton-check @CHANNEL  skeleton score vs the real 3-second hold (last 5 videos)
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import os
import sys
import time
from pathlib import Path

from . import project as project_mod, settings, submit

# Bookkeeping the app adds on purpose; everything else must match after undo.
APP_FILES = {submit.LOG_NAME}
APP_DIRS = {project_mod.STATE_DIR}


def _open(folder: str):
    settings.load_env()
    return project_mod.open_project(folder)


def cmd_copy(a):
    """Copy a T7 folder for testing: contents and modified times, minus the app's own cache."""
    import shutil
    src, dst = Path(a.src), Path(a.dst)
    if dst.exists():
        print(f"{dst} already exists; not copying over it.")
        sys.exit(2)
    shutil.copytree(src, dst, copy_function=shutil.copy2, ignore=shutil.ignore_patterns(project_mod.STATE_DIR))
    n = sum(len(files) for _, _, files in os.walk(dst))
    print(f"Copied {n} files to {dst}.")


def cmd_analyze(a):
    proj = _open(a.folder)
    n = proj.queue(None, force=a.force)
    print(f"Analyzing {n} file(s)...")
    while True:
        view = proj.view()
        states = [c["status"] for c in view["cards"]]
        busy = sum(s in ("waiting", "analyzing") for s in states)
        if busy == 0:
            break
        print(f"  {len(states) - busy}/{len(states)} done", end="\r")
        time.sleep(1)
    errors = [c for c in view["cards"] if c["status"] == "error"]
    print(f"Done. {len(view['cards'])} files, {len(errors)} errors."
          f"  Claude: {'on' if view['claude'] else 'OFF (rules only)'}"
          f"  Whisper: {'on' if view['whisper'] else 'OFF (estimate)'}")
    for c in view["cards"]:
        print(f"  {c['original_name']:<40} {c['category_name'] or '-':<17} speech={c['speech'] or '-':<5}"
              f" -> {c['proposed_path'] or '-'}")
    for c in errors:
        print(f"  ERROR {c['path']}: {c['error']}")


def cmd_plan(a):
    proj = _open(a.folder)
    p = submit.plan(proj)
    print(f"Dry run {p['plan_id']}: {len(p['ops'])} change(s)")
    for op in p["ops"]:
        print(f"  {op['src']}  ->  {op['dst']}{'   (name taken, added suffix)' if op['suffixed'] else ''}")
    return p


def cmd_apply(a):
    p = cmd_plan(a)
    if not a.yes:
        print("Nothing applied. Add --yes to apply exactly this list.")
        return
    proj = _open(a.folder)
    r = submit.apply(proj, p["plan_id"])
    print(f"Applied {r['applied']} change(s). Errors: {r['errors'] or 'none'}")


def cmd_undo(a):
    proj = _open(a.folder)
    r = submit.undo(proj)
    print(f"Restored {r['restored']} file(s). Conflicts: {r['conflicts'] or 'none'}."
          f" Folders kept: {r['folders_kept'] or 'none'}")


def listing(folder: Path) -> list[tuple]:
    rows = []
    for dirpath, dirnames, filenames in os.walk(folder):
        dirnames[:] = sorted(d for d in dirnames if d not in APP_DIRS)
        rel_dir = Path(dirpath).relative_to(folder).as_posix()
        if rel_dir != ".":
            rows.append((rel_dir + "/", "dir", "", ""))
        for name in sorted(filenames):
            if name in APP_FILES or name == ".DS_Store":
                continue
            p = Path(dirpath) / name
            st = p.stat()
            h = hashlib.sha256()
            with open(p, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
            rows.append((p.relative_to(folder).as_posix(), str(st.st_size), h.hexdigest()[:16],
                         str(int(st.st_mtime))))
    return sorted(rows)


def cmd_snapshot(a):
    rows = listing(Path(a.folder))
    with open(a.out, "w", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["path", "size", "sha256", "mtime"])
        w.writerows(rows)
    print(f"{len(rows)} entries -> {a.out}")


def cmd_compare(a):
    def read(p):
        with open(p) as f:
            return [tuple(r) for r in csv.reader(f, delimiter="\t")][1:]
    x, y = read(a.a), read(a.b)
    if x == y:
        print(f"IDENTICAL: {len(x)} entries match (path, size, sha256, modified time).")
        return
    print("DIFFERENT:")
    for r in sorted(set(x) - set(y)):
        print("  only before:", "  ".join(r))
    for r in sorted(set(y) - set(x)):
        print("  only after: ", "  ".join(r))
    sys.exit(1)


def cmd_labels_template(a):
    if Path(a.out).exists():
        print(f"{a.out} already exists; left it alone.")
        return
    proj = _open(a.folder)
    cats = ", ".join(c["name"] for c in settings.load()["categories"])
    with open(a.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["original_name", "your_category"])
        for e in sorted(proj.entries(), key=lambda e: e["original_name"].lower()):
            w.writerow([e["original_name"], ""])
    print(f"Wrote {a.out}. Fill in your_category with one of: {cats}")


def cmd_accuracy(a):
    proj = _open(a.folder)
    cfg = settings.load()
    by_name = {c["name"].lower(): c["id"] for c in cfg["categories"]}
    names = {c["id"]: c["name"] for c in cfg["categories"]}
    entries = {e["original_name"]: e for e in proj.entries()}
    total = match = 0
    misses = []
    with open(a.labels, newline="") as f:
        for row in csv.DictReader(f):
            label = (row.get("your_category") or "").strip()
            if not label:
                continue
            e = entries.get(row["original_name"].strip())
            if not e:
                misses.append(f"  {row['original_name']}: not found in this folder")
                continue
            want = by_name.get(label.lower())
            if not want:
                misses.append(f"  {row['original_name']}: unknown category {label!r}")
                continue
            ai = (e.get("analysis") or {}).get("category")  # the app's own pick, not a manual override
            total += 1
            if ai == want:
                match += 1
            else:
                misses.append(f"  {row['original_name']}: you said {names[want]}, app said {names.get(ai, ai)}")
    print(f"Category match: {match} of {total}" + (f" ({100 * match / total:.0f}%)" if total else ""))
    print("Mismatches:" if misses else "No mismatches.")
    print("\n".join(misses))


IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}


def cmd_score_ab(a):
    """AB_FOLDER/<one folder per past test>/ holds that test's thumbnails plus winner.txt
    (the winning file's name), or the winning file has "winner" in its name."""
    import json
    from . import thumbs, vision
    settings.load_env()
    cfg = settings.load()
    canned = json.loads(Path(a.facts).read_text()) if a.facts else None
    tests = sorted(d for d in Path(a.folder).iterdir() if d.is_dir() and not d.name.startswith("."))
    if not tests:
        print(f"No test folders in {a.folder}. Make one folder per A/B test with its thumbnails inside.")
        return
    print("Claude: " + ("saved readings" if canned is not None else "on" if vision.available() else "off (local checks only)") + "\n")
    matched = counted = 0
    for d in tests:
        imgs = sorted(p for p in d.iterdir() if p.suffix.lower() in IMAGE_EXT and not p.name.startswith("."))
        wfile = d / "winner.txt"
        winner = wfile.read_text().strip() if wfile.exists() else next((p.name for p in imgs if "winner" in p.stem.lower()), "")
        if len(imgs) < 2 or winner not in {p.name for p in imgs}:
            print(f"{d.name}: skipped (needs 2+ images and a winner.txt naming one of them)\n")
            continue
        rows = []
        for p in imgs:
            facts = canned.get(p.name) if canned is not None else vision.thumbnail_facts(p, cfg)
            r = thumbs.score(p, facts)
            fails = [c["label"] for c in r["checks"] if c["ok"] is False]
            rows.append({"name": p.name, "score": r["score"], "fails": fails})
        thumbs.rank(rows)
        rows.sort(key=lambda x: x["rank"])
        counted += 1
        hit = rows[0]["name"] == winner
        matched += hit
        print(f"{d.name}: real winner {winner} · app's #1 {rows[0]['name']} · {'MATCH' if hit else 'no match'}")
        for x in rows:
            mark = "  <- real winner" if x["name"] == winner else ""
            print(f"   #{x['rank']} {x['score']:>3}  {x['name']}{mark}" + (f"   (fails: {', '.join(x['fails'])})" if x["fails"] else ""))
        print()
    if counted:
        print(f"The app's #1 matched the real winner in {matched} of {counted} test(s).")


class _PrintJob:
    def progress(self, done, total, message=""):
        print(f"  {message}" + (f"  ({done * 100 // total}%)" if total else ""), end="\r", flush=True)

    def note(self, message):
        print(f"  {message}", end="\r", flush=True)


def cmd_ingest(a):
    from . import ingest
    dest = Path(a.dest).expanduser()
    test_root = Path.home() / "bin-test"
    if not a.allow_t7 and test_root not in dest.resolve().parents and dest.resolve() != test_root:
        print(f"For testing, --dest must be inside {test_root}. (The app itself ingests to the T7.)")
        sys.exit(2)
    dest.mkdir(parents=True, exist_ok=True)
    r = ingest.run(_PrintJob(), a.src, a.name, str(dest))
    print(" " * 100, end="\r")
    print(f"Copied into {r['raw']}")
    print(f"{r['matched']} of {r['files']} files match their SHA-256 checksum (read back from the copy).")
    for x in r["problems"]:
        print(f"  PROBLEM {x['source']}: {x['result']}")
    print("SAFE TO WIPE THE CARD" if r["safe_to_wipe"] else "NOT SAFE TO WIPE THE CARD")
    print(f"Report: {r['report']}")
    print(Path(r["report"]).read_text())


def cmd_fix_proxy(a):
    from . import proxy
    proj = _open(a.folder)
    todo = proxy.todo(proj)
    print(f"Won't decode: {len(todo['fix'])}   Need a proxy: {len(todo['proxy'])}")
    r = proxy.run(_PrintJob(), proj)
    print(" " * 100, end="\r")
    for d in r["done"]:
        print(f"  {d['what']:<5} {d['src']}  ->  {d['out']}")
    print(f"Errors: {r['errors'] or 'none'}")


def cmd_lut_compare(a):
    import subprocess
    import tempfile
    from . import frames, lut, media
    if not lut.path():
        print("No LUT installed yet. Add it in Settings → Analysis.")
        sys.exit(2)
    src = Path(a.clip)
    d = media.probe(src).get("duration") or 2
    tmp = Path(tempfile.mkdtemp())
    before, after = tmp / "before.jpg", tmp / "after.jpg"
    frames.frame_at(src, d * 0.5, before, None, 720)
    frames.frame_at(src, d * 0.5, after, lut.filter_for(), 720)
    panels = [(before, "BEFORE (D-Log M)"), (after, "STEP 1 (Rec.709)")]
    look = lut.look_path(a.channel)
    if look:
        panels.append((lut.graded_frame(after, look, tmp), f"STEP 2 ({look.stem})"))
    out = Path(a.out)
    inputs = [x for p, _ in panels for x in ("-i", str(p))]
    labels = "".join(f"[{i}]drawtext=text='{t}':x=12:y=12:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6[p{i}];"
                     for i, (_, t) in enumerate(panels))
    stack = "".join(f"[p{i}]" for i in range(len(panels))) + f"hstack=inputs={len(panels)}"
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", labels + stack, str(out)],
                       capture_output=True, text=True)
    if r.returncode != 0:  # ffmpeg without drawtext: no labels
        subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex",
                        "".join(f"[{i}]" for i in range(len(panels))) + f"hstack=inputs={len(panels)}", str(out)], check=True)
    print(f"Saved: {out}")
    print("Left to right: " + " | ".join(t for _, t in panels) + ". The clip itself is unchanged.")


def cmd_flubmap(a):
    from . import flubs
    settings.load_env()
    clip = Path(a.clip)
    if clip.is_dir():  # a project folder: pick its talking-head clip with the most talking
        proj = _open(str(clip))
        talk = [e for e in flubs.candidates(proj) if e.get("category") == "talking-head"] or flubs.candidates(proj)
        if not talk:
            print("No analyzed clip with talking in that folder. Run analyze first.")
            sys.exit(2)
        clip = proj.root / max(talk, key=lambda e: (e.get("speech") or {}).get("ratio", 0))["path"]
    m = flubs.build(clip, settings.load())
    print(f"Flub & silence map: {clip.name}   ({m['engine']})\n")
    events = [(f["t"], f["end"], "FLUB MARKER" if f["kind"] == "marker" else "possible flub", f["text"]) for f in m["flubs"]]
    events += [(x, y, "silence", f"{y - x:.1f}s") for x, y in m["silences"]]
    for t, end, what, detail in sorted(events):
        print(f"  {flubs.fmt_t(t)}–{flubs.fmt_t(end)}  {what:<14} {detail}")
    if m["takes"]:
        print("\nRepeated takes (#1 = best delivery):")
        for g in m["takes"]:
            print(f"  \"{g['line'][:80]}\"")
            for t in sorted(g["takes"], key=lambda t: t["rank"]):
                print(f"     #{t['rank']} {flubs.fmt_t(t['start'])}–{flubs.fmt_t(t['end'])}  score {t['score']}  {t['notes']}")
    print("\nTranscript (check the flubs against what you actually said):")
    for s in m["transcript"]:
        print(f"  {flubs.fmt_t(s['start'])}  {s['text']}")


def cmd_retention(a):
    from . import retention
    settings.load_env()
    pulled = retention.run_due()
    print("Pulled now: " + (", ".join(pulled) or "nothing due"))
    t = retention.loses_viewers()
    print(f"\nWhat loses viewers ({len(t['videos'])} videos with a curve and a clip order):")
    print(f"  {'Category':<18} {'On screen':>10} {'Drops':>6} {'Per 10 min':>11} {'Avg drop':>9}")
    for r in t["rows"]:
        print(f"  {r['name']:<18} {r['minutes']:>8} m {r['drops']:>6} {r['per_10_min'] if r['per_10_min'] is not None else '-':>11}"
              f" {('-' + str(round(r['avg_lost'] * 100)) + ' pts') if r['avg_lost'] else '-':>9}")


def cmd_bullseye(a):
    from . import strategy
    settings.load_env()
    r = strategy.run_bullseye(_PrintJob(), a.channel)
    print(" " * 100, end="\r")
    print(f"Audience Bullseye for {a.channel} ({r['persona']}): {len(r['channels'])} channels, {len(r['outliers'])} outliers (3x+)")
    for n in r["notes"]:
        print("  note:", n)
    by_id = {o["id"]: o for o in r["outliers"]}
    for i, t in enumerate(r["topics"][:10], 1):
        p = t["parts"]
        print(f"\n{i:>2}. {t['name']}  {t['score']}/16  [{t['funnel']} of funnel]  fit {p['audience_fit']} · demand {p['demand']}"
              f" · gap {p['gap']} · Thu–Sat {p['filmable']}")
        for vid in t["video_ids"][:3]:
            o = by_id[vid]
            print(f"      {o['score']}x  {o['title'][:70]}  ({o['channel']})  {o['url']}")


def cmd_skeleton_check(a):
    from . import strategy, youtube
    settings.load_env()
    cid = next((c["id"] for c in youtube.status()["channels"] if (c.get("handle") or "").lower() == a.channel.lower()), None)
    if not cid:
        print(f"{a.channel} isn't connected.")
        sys.exit(2)
    if not strategy.skeletons(a.channel):
        print("Finding hook skeletons first...")
        strategy.build_skeletons(_PrintJob(), a.channel)
    r = strategy.skeleton_check(_PrintJob(), a.channel, cid, 5)
    print(" " * 100, end="\r")
    for row in r["rows"]:
        hold = "-" if row["hold_3s"] is None else f"{round(row['hold_3s'] * 100)}%" + ("" if row["exact"] else f" (≈ {row['step_seconds']}s steps)")
        print(f"  {row['title'][:50]:<50}  {row['skeleton'][:34]:<34}  {str(row['skeleton_score'] or '-'):>5}x  held at 0:03: {hold}")
    print(f"\nRank correlation: {r['rho'] if r['rho'] is not None else 'not enough videos with a skeleton'}  ({r['paired']} paired)")
    print(r["note"])


def _errors() -> tuple:
    from . import ingest, lut, strategy, youtube
    return (ingest.IngestError, lut.LutError, strategy.StrategyError, youtube.YouTubeError)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="blkbin.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("copy"); s.add_argument("src"); s.add_argument("dst"); s.set_defaults(fn=cmd_copy)
    s = sub.add_parser("analyze"); s.add_argument("folder"); s.add_argument("--force", action="store_true")
    s.set_defaults(fn=cmd_analyze)
    s = sub.add_parser("plan"); s.add_argument("folder"); s.set_defaults(fn=cmd_plan)
    s = sub.add_parser("apply"); s.add_argument("folder"); s.add_argument("--yes", action="store_true")
    s.set_defaults(fn=cmd_apply)
    s = sub.add_parser("undo"); s.add_argument("folder"); s.set_defaults(fn=cmd_undo)
    s = sub.add_parser("snapshot"); s.add_argument("folder"); s.add_argument("out"); s.set_defaults(fn=cmd_snapshot)
    s = sub.add_parser("compare"); s.add_argument("a"); s.add_argument("b"); s.set_defaults(fn=cmd_compare)
    s = sub.add_parser("labels-template"); s.add_argument("folder"); s.add_argument("out")
    s.set_defaults(fn=cmd_labels_template)
    s = sub.add_parser("accuracy"); s.add_argument("folder"); s.add_argument("labels")
    s.set_defaults(fn=cmd_accuracy)
    s = sub.add_parser("score-ab"); s.add_argument("folder"); s.add_argument("--facts", help=argparse.SUPPRESS)
    s.set_defaults(fn=cmd_score_ab)
    s = sub.add_parser("ingest"); s.add_argument("src"); s.add_argument("name"); s.add_argument("--dest", required=True)
    s.add_argument("--allow-t7", action="store_true", help=argparse.SUPPRESS); s.set_defaults(fn=cmd_ingest)
    s = sub.add_parser("fix-proxy"); s.add_argument("folder"); s.set_defaults(fn=cmd_fix_proxy)
    s = sub.add_parser("lut-compare"); s.add_argument("clip"); s.add_argument("out")
    s.add_argument("--channel", default="@blkgrlco", help="whose creative look to show as step 2"); s.set_defaults(fn=cmd_lut_compare)
    s = sub.add_parser("flubmap"); s.add_argument("clip"); s.set_defaults(fn=cmd_flubmap)
    s = sub.add_parser("retention"); s.set_defaults(fn=cmd_retention)
    s = sub.add_parser("bullseye"); s.add_argument("channel"); s.set_defaults(fn=cmd_bullseye)
    s = sub.add_parser("skeleton-check"); s.add_argument("channel"); s.set_defaults(fn=cmd_skeleton_check)
    a = ap.parse_args(argv)
    try:
        a.fn(a)
    except (project_mod.ProjectError, submit.SubmitError, RuntimeError, ValueError, *_errors()) as exc:
        print(f"Error: {exc}")
        sys.exit(2)


if __name__ == "__main__":
    main()
