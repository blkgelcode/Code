#!/bin/bash
# Double-click to run the Phase 1 tests on a COPY of one T7 folder.
# Your T7 originals are only read (copied), never renamed or moved.
#
#   1  Full test: copy a folder to ~/bin-test, analyze, submit, undo, prove it's identical
#   2  Score your labels: compare your 30 hand labels with the app's categories

cd "$(dirname "$0")" || exit 1
APP="$(pwd)"
VENV="$HOME/Library/Application Support/BLKGRLCO Bin/venv"
PYBIN="$VENV/bin/python"
[ -x "$PYBIN" ] || { echo "Run 'Start BLKGRLCO Bin.command' once first (it installs everything)."; read -r _; exit 1; }
TEST_ROOT="$HOME/bin-test"
mkdir -p "$TEST_ROOT"
cli() { "$PYBIN" -m blkbin.cli "$@"; }
unquote() { "$PYBIN" -c 'import shlex,sys; print(shlex.split(sys.argv[1])[0] if sys.argv[1].strip() else "")' "$1"; }

echo "BLKGRLCO Bin tests"
echo "  1) Full test on a fresh copy of one T7 folder"
echo "  2) Score my hand labels"
read -r -p "Choose 1 or 2: " MODE

if [ "$MODE" = "2" ]; then
  read -r -p "Drag the test copy folder (inside ~/bin-test) here, then Return: " RAW
  DEST="$(unquote "$RAW")"
  LABELS="$TEST_ROOT/labels-$(basename "$DEST").csv"
  [ -f "$LABELS" ] || { echo "No labels file at $LABELS"; read -r _; exit 1; }
  cli accuracy "$DEST" "$LABELS" | tee "$TEST_ROOT/accuracy-$(date +%Y%m%d-%H%M%S).txt"
  echo; read -r -p "Done. Press Return to close." _
  exit 0
fi

read -r -p "Drag ONE video folder from the T7 into this window, then press Return: " RAW
SRC="$(unquote "$RAW")"
[ -d "$SRC" ] || { echo "That isn't a folder: $SRC"; read -r _; exit 1; }
case "$SRC" in "$TEST_ROOT"*) echo "Pick an original T7 folder, not one inside ~/bin-test."; read -r _; exit 1;; esac

NAME="$(basename "$SRC")"
DEST="$TEST_ROOT/$NAME"; n=2
while [ -e "$DEST" ]; do DEST="$TEST_ROOT/$NAME-$n"; n=$((n+1)); done
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$TEST_ROOT/report-$STAMP.txt"
WORK="$TEST_ROOT/.work-$STAMP"; mkdir -p "$WORK"

{
echo "BLKGRLCO Bin test report  $(date)"
echo "Original (read only): $SRC"
echo "Test copy:            $DEST"
echo
echo "== Copying (ditto, original untouched) =="
cli snapshot "$SRC" "$WORK/original-start.tsv"
ditto "$SRC" "$DEST" && echo "Copied $(find "$DEST" -type f | wc -l | tr -d ' ') files."
echo
echo "== Unit tests =="
"$PYBIN" -m unittest discover -s "$APP/tests" 2>&1 | tail -3
echo
echo "== Analyze =="
cli analyze "$DEST"
echo
echo "== Snapshot BEFORE submit =="
cli snapshot "$DEST" "$WORK/before.tsv"
echo
echo "== Submit (dry run, then apply exactly that list) =="
cli apply "$DEST" --yes
cli snapshot "$DEST" "$WORK/after-submit.tsv"
echo
echo "== Undo last submit =="
cli undo "$DEST"
cli snapshot "$DEST" "$WORK/after-undo.tsv"
echo
echo "== Proof: BEFORE vs AFTER UNDO (path, size, sha256, modified time) =="
cli compare "$WORK/before.tsv" "$WORK/after-undo.tsv"
echo
echo "-- listing BEFORE --";            cat "$WORK/before.tsv"
echo; echo "-- listing AFTER SUBMIT --";  cat "$WORK/after-submit.tsv"
echo; echo "-- listing AFTER UNDO --";    cat "$WORK/after-undo.tsv"
echo
echo "(_bin-log.csv and the app's hidden .blkgrlco-bin folder are left out on purpose: the log keeps a record of the submit and the undo.)"
echo
echo "== Proof the T7 original was never touched =="
cli snapshot "$SRC" "$WORK/original-end.tsv"
cli compare "$WORK/original-start.tsv" "$WORK/original-end.tsv"
echo
LABELS="$TEST_ROOT/labels-$(basename "$DEST").csv"
cli labels-template "$DEST" "$LABELS"
} 2>&1 | tee "$REPORT"

echo
echo "Report saved: $REPORT"
echo "Next: open $TEST_ROOT/labels-$(basename "$DEST").csv, fill in your_category for 30 clips,"
echo "then double-click run-tests.command again and choose 2."
read -r -p "Press Return to close." _
