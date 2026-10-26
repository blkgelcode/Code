"""Command-line tools, used by run-tests.command.

  python -m blkbin.cli analyze  FOLDER          analyze every file (waits until done)
  python -m blkbin.cli plan     FOLDER          print the dry run
  python -m blkbin.cli apply    FOLDER --yes    apply the dry run
  python -m blkbin.cli undo     FOLDER          undo the last submit
  python -m blkbin.cli snapshot FOLDER OUT.tsv  file listing with checksums
  python -m blkbin.cli compare  A.tsv B.tsv     are two listings identical?
  python -m blkbin.cli labels-template FOLDER OUT.csv
  python -m blkbin.cli accuracy FOLDER LABELS.csv
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


def main(argv=None):
    ap = argparse.ArgumentParser(prog="blkbin.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
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
    a = ap.parse_args(argv)
    try:
        a.fn(a)
    except (project_mod.ProjectError, submit.SubmitError) as exc:
        print(f"Error: {exc}")
        sys.exit(2)


if __name__ == "__main__":
    main()
