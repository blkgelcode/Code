#!/usr/bin/env bash
# Stop everything. Your data stays safe in Docker's named volumes and in each app.
#
#   ./stop.sh              stop the Docker tools, the hub, and quit the desktop apps
#   ./stop.sh --keep-apps  leave the desktop apps (dictation, recording…) running

set -u
. "$(dirname "$0")/lib/common.sh"

APPS=1
for a in "$@"; do
  case "$a" in
    --keep-apps) APPS=0 ;;
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $a" ;;
  esac
done

head1 "Stopping BLKGRLCO Studio OS"

# ── Hub ──
pidf="$STUDIO_DIR/run/hub.pid"
if [ -f "$pidf" ] && kill "$(cat "$pidf")" 2>/dev/null; then ok "Hub stopped"; else ok "Hub wasn't running"; fi
rm -f "$pidf"
pkill -f "$STUDIO_DIR/hub/server.mjs" 2>/dev/null || true

# ── Docker tools (containers removed, named volumes kept) ──
if have docker && docker_up; then
  compose --profile '*' down --remove-orphans >/dev/null 2>&1 && ok "Docker services stopped (data kept in volumes)"
else
  ok "Docker isn't running, nothing to stop"
fi

# ── Desktop apps ──
if [ "$APPS" = "1" ] && is_mac; then
  for id in voice notes dictation record; do
    app="$(tool_field "$id" app 2>/dev/null)"
    [ -n "$app" ] && app_running "$app" || continue
    osascript -e "tell application \"$app\" to quit" >/dev/null 2>&1 && ok "Quit $app"
  done
fi
exit 0
