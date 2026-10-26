#!/bin/bash
# Double-click this file in Finder to start BLKGRLCO Bin.
# First run installs what it needs (a few minutes); later runs start in seconds.

cd "$(dirname "$0")" || exit 1
APP_HOME="$HOME/Library/Application Support/BLKGRLCO Bin"
VENV="$APP_HOME/venv"
PORT=4321
mkdir -p "$APP_HOME"

pause() { echo; read -r -p "Press Return to close this window." _; }

if curl -s "http://localhost:$PORT/api/status" >/dev/null 2>&1; then
  echo "BLKGRLCO Bin is already running. Opening it."
  open "http://localhost:$PORT"
  exit 0
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg isn't installed. Install it with Homebrew, then double-click this file again:"
  echo "    brew install ffmpeg"
  echo "(No Homebrew yet? See https://brew.sh)"
  pause; exit 1
fi

PY=""
for cand in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
    PY="$(command -v "$cand")"; break
  fi
done
if [ -z "$PY" ]; then
  echo "This needs Python 3.10 or newer. Install it with:"
  echo "    brew install python@3.12"
  pause; exit 1
fi

if [ ! -x "$VENV/bin/python" ]; then
  echo "First run: setting up (this takes a few minutes)..."
  "$PY" -m venv "$VENV" || { pause; exit 1; }
fi

REQ_HASH="$(shasum requirements.txt | cut -d' ' -f1)"
if [ "$(cat "$VENV/.req-hash" 2>/dev/null)" != "$REQ_HASH" ]; then
  echo "Installing: Claude SDK, local Whisper, image tools..."
  "$VENV/bin/python" -m pip install --upgrade pip -q
  if "$VENV/bin/python" -m pip install -q -r requirements.txt; then
    echo "$REQ_HASH" > "$VENV/.req-hash"
  else
    echo "Some packages didn't install. The app still runs, with fewer features."
  fi
fi

( for _ in $(seq 1 40); do
    sleep 0.5
    curl -s "http://localhost:$PORT/api/status" >/dev/null 2>&1 && { open "http://localhost:$PORT"; break; }
  done ) &

echo "Starting BLKGRLCO Bin at http://localhost:$PORT  (close this window to stop it)"
exec "$VENV/bin/python" -m blkbin --port "$PORT"
