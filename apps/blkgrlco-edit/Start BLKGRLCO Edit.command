#!/bin/bash
# Double-click this file in Finder to start BLKGRLCO Edit.
# Optional: drag a project folder onto Terminal after the file name to edit that folder instead
# (it needs a media/ folder inside; timeline.json is created on first run).

cd "$(dirname "$0")" || exit 1
PORT=5310
PROJECT="${1:-$PWD/project}"

pause() { echo; read -r -p "Press Return to close this window." _; }

if curl -s "http://localhost:$PORT/api/state" >/dev/null 2>&1; then
  echo "BLKGRLCO Edit is already running. Opening it."
  open "http://localhost:$PORT"
  exit 0
fi
for tool in node ffmpeg ffprobe; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool isn't installed. Install it with Homebrew, then double-click this file again:"
    echo "    brew install node ffmpeg"
    echo "(No Homebrew yet? See https://brew.sh)"
    pause; exit 1
  fi
done

LOCK_HASH="$(shasum package-lock.json 2>/dev/null | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$LOCK_HASH" ]; then
  echo "First run: installing (a minute)..."
  npm install --no-audit --no-fund || { pause; exit 1; }
  echo "$LOCK_HASH" > node_modules/.lock-hash
fi
SRC_HASH="$(cat src/*.js src/*.jsx src/*.css src/components/*.jsx index.html | shasum | cut -d' ' -f1)"
if [ ! -f dist/index.html ] || [ "$(cat dist/.src-hash 2>/dev/null)" != "$SRC_HASH" ]; then
  echo "Building the app..."
  npx vite build >/dev/null || { pause; exit 1; }
  echo "$SRC_HASH" > dist/.src-hash
fi

( for _ in $(seq 1 40); do
    sleep 0.5
    curl -s "http://localhost:$PORT/api/state" >/dev/null 2>&1 && { open "http://localhost:$PORT"; break; }
  done ) &

echo "BLKGRLCO Edit at http://localhost:$PORT  (close this window to stop it)"
echo "Editing: $PROJECT/timeline.json"
exec node server/index.js --port "$PORT" --project "$PROJECT"
