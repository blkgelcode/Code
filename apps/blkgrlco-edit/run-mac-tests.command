#!/bin/bash
# Double-click to run BLKGRLCO Edit's checks on this Mac and print a report to paste back to Claude.
# It uses generated test clips in a temporary folder — it never touches your projects or footage.
cd "$(dirname "$0")" || exit 1
REPORT="$(mktemp -t blkedit-report).txt"
pause() { echo; read -r -p "Press Return to close this window." _; }
say() { echo "$@" | tee -a "$REPORT"; }

say "BLKGRLCO Edit — Mac test report ($(date '+%Y-%m-%d %H:%M'))"
say "macOS $(sw_vers -productVersion 2>/dev/null) · $(uname -m) · node $(node -v 2>/dev/null) · $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f1-3)"
for tool in node npm ffmpeg ffprobe; do command -v "$tool" >/dev/null || { say "✗ $tool missing (brew install node ffmpeg)"; pause; exit 1; }; done
say "hardware encoders: $(ffmpeg -hide_banner -encoders 2>/dev/null | grep -o '[a-z0-9]*_videotoolbox' | tr '\n' ' ')"

[ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1
say ""
say "0. Hardware video (VideoToolbox) and a real 4K60 10-bit HEVC proxy encode"
npx tsx scripts/caps.ts 2>&1 | sed 's/^/   /' | tee -a "$REPORT"

say "1. Build + type check"
npm run build >/dev/null 2>&1 && say "   ✓ build" || say "   ✗ build failed (run npm run build to see why)"
npm run typecheck >/dev/null 2>&1 && say "   ✓ types" || say "   ✗ type errors"

say "2. Unit + end-to-end tests (history, merge, undo, crash recovery, import engine, offline drive, export)"
npm test 2>&1 | grep -E "^# (pass|fail)|^not ok" | sed 's/^/   /' | tee -a "$REPORT" >/dev/null
grep -q "^   # fail 0" "$REPORT" && echo "   ✓ all passed" || echo "   (see failures above)"

say "3. Mac app (opens a window for ~20 s: don't click in it)"
node test/electron.cjs 2>&1 | grep -E "^[✓✗]" | sed 's/^/   /' | tee -a "$REPORT" >/dev/null
cat "$REPORT" | tail -8

say ""
say "Report saved to $REPORT — copy everything above and paste it to Claude."
pbcopy < "$REPORT" 2>/dev/null && echo "(It's also on your clipboard.)"
pause
