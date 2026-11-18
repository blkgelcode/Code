#!/bin/bash
# Double-click in Finder to open BLKGRLCO Edit (the Mac app).
#   First run installs and builds (a couple of minutes); later runs open in seconds.
#   To open a specific project folder, run from Terminal:
#     "./Start BLKGRLCO Edit.command" "/Volumes/Untitled/project hhh/<video>/edit"
#   (Otherwise it reopens the last project; File → Open Project Folder… switches.)
#   Add --browser to use it in a normal browser tab instead of the app window.

cd "$(dirname "$0")" || exit 1
pause() { echo; read -r -p "Press Return to close this window." _; }

for tool in node npm ffmpeg ffprobe; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool isn't installed. Install it with Homebrew, then double-click this file again:"
    echo "    brew install node ffmpeg"
    echo "(No Homebrew yet? See https://brew.sh)"
    pause; exit 1
  fi
done

LOCK_HASH="$(shasum package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$LOCK_HASH" ]; then
  echo "Installing (first run, a couple of minutes)..."
  npm install --no-audit --no-fund || { pause; exit 1; }
  echo "$LOCK_HASH" > node_modules/.lock-hash
fi
SRC_HASH="$(find src shared server electron index.html -type f -print0 | sort -z | xargs -0 shasum | shasum | cut -d' ' -f1)"
if [ ! -f dist/index.html ] || [ ! -f dist-server/server.mjs ] || [ "$(cat dist/.src-hash 2>/dev/null)" != "$SRC_HASH" ]; then
  echo "Building..."
  npm run build >/dev/null || { echo "Build failed:"; npm run build; pause; exit 1; }
  echo "$SRC_HASH" > dist/.src-hash
fi

PROJECT_ARGS=()
BROWSER=0
for a in "$@"; do
  if [ "$a" = "--browser" ]; then BROWSER=1; else PROJECT_ARGS=(--project "$a"); fi
done

if [ "$BROWSER" = 1 ]; then
  PROJ="${PROJECT_ARGS[1]:-$PWD/project}"
  ( for _ in $(seq 1 40); do sleep 0.5; curl -s http://localhost:5310/api/state >/dev/null 2>&1 && { open http://localhost:5310; break; }; done ) &
  echo "BLKGRLCO Edit at http://localhost:5310 (close this window to stop). Project: $PROJ"
  # restart the server automatically if it ever crashes (exit code 3 = project already open)
  while true; do node dist-server/server.mjs --port 5310 --project "$PROJ"; code=$?; [ $code -eq 0 ] || [ $code -eq 3 ] && break; echo "Server stopped ($code); restarting..."; sleep 1; done
  pause; exit 0
fi

echo "Opening BLKGRLCO Edit..."
exec ./node_modules/.bin/electron . "${PROJECT_ARGS[@]}"
