#!/usr/bin/env bash
# Start everything: the Docker tools, the hub (http://localhost:4000) and the desktop apps.
#
#   ./start.sh               everything, then opens the hub in your browser
#   ./start.sh --no-apps     leave the desktop apps closed
#   ./start.sh --no-browser  don't open the hub page
#   ./start.sh --hub-only    only the hub (install.sh uses this)

set -u
. "$(dirname "$0")/lib/common.sh"

APPS=1; BROWSER=1; HUB_ONLY=0
for a in "$@"; do
  case "$a" in
    --no-apps) APPS=0 ;;
    --no-browser) BROWSER=0 ;;
    --hub-only) HUB_ONLY=1 ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $a" ;;
  esac
done

[ -f "$ENV_FILE" ] || die "No .env yet. Run ./install.sh first."
mkdir -p "$STUDIO_DIR/logs" "$STUDIO_DIR/run"

# Tools listed in STUDIO_DISABLED (e.g. "seo,voice") stay off. Handy on an 8 GB Mac.
DISABLED=",$(env_get STUDIO_DISABLED | tr -d ' '),"
disabled() { case "$DISABLED" in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

start_hub() {
  local pidf="$STUDIO_DIR/run/hub.pid"
  if [ -f "$pidf" ] && kill -0 "$(cat "$pidf")" 2>/dev/null && http_ok "http://localhost:$HUB_PORT/api/health"; then
    ok "Hub already running at http://localhost:$HUB_PORT"; return 0
  fi
  have node || die "Node.js is missing. Run ./install.sh."
  nohup node "$STUDIO_DIR/hub/server.mjs" >> "$STUDIO_DIR/logs/hub.log" 2>&1 &
  echo $! > "$pidf"
  if wait_http "http://localhost:$HUB_PORT/api/health" 15; then
    ok "Hub running at http://localhost:$HUB_PORT"
  else
    fail "Hub didn't start. Last lines of logs/hub.log:"; tail -n 5 "$STUDIO_DIR/logs/hub.log"; return 1
  fi
}

if [ "$HUB_ONLY" = "1" ]; then start_hub; exit $?; fi

head1 "Starting BLKGRLCO Studio OS"

# ── Docker tools ──
ensure_docker
VT="$(video_tool)"
SERVICES=""
for svc in $(compose config --services 2>/dev/null); do
  case "$svc" in
    open-higgsfield|open-generative-ai) disabled video && continue
      [ -d "$STUDIO_DIR/src/$svc" ] || { warn "Video tool not installed yet (run ./install.sh video)"; continue; } ;;
    seo-*)      disabled seo && continue ;;
    calcom*)    disabled calcom && continue ;;
    chatwoot-*) disabled chatwoot && continue ;;
    tunnel)     [ -n "$(env_get CLOUDFLARE_TUNNEL_TOKEN)" ] || { warn "The public tunnel is on in COMPOSE_PROFILES but CLOUDFLARE_TUNNEL_TOKEN is empty; skipping it"; continue; } ;;
  esac
  SERVICES="$SERVICES $svc"
done
[ -n "$SERVICES" ] || die "Docker can't read docker-compose.yml. Run: docker compose config"
# shellcheck disable=SC2086
compose up -d --remove-orphans $SERVICES >/dev/null 2>"$STUDIO_DIR/logs/compose-up.log" \
  || { fail "docker compose up failed:"; tail -n 15 "$STUDIO_DIR/logs/compose-up.log"; exit 1; }
ok "Docker services started"

# ── Hub ──
start_hub || true

# ── Desktop apps ──
if [ "$APPS" = "1" ] && is_mac; then
  for id in voice notes dictation record; do
    disabled "$id" && continue
    app="$(tool_field "$id" app)"
    if app_path "$app" >/dev/null; then open -ga "$app" && ok "Opened $app"; fi
  done
fi

# ── Wait for the web tools ──
say "  ${DIM}Waiting for the web tools to answer (Cal.com and Chatwoot take a minute or two)…${RS}"
check() {  # check <id> <label> <url>
  disabled "$1" && { say "  ${DIM}–  $2: off (STUDIO_DISABLED)${RS}"; return; }
  if wait_http "$3" "${WAIT_SECS:-240}"; then ok "$2  ${DIM}$3${RS}"; else fail "$2 isn't answering yet at $3 (check the hub's Status tab)"; fi
}
check video    "Video & image (port 4101)" "http://localhost:4101/" &
check seo      "OpenSEO (port 4102)"       "http://localhost:4102/api/health" &
check calcom   "Cal.com (port 4103)"       "http://localhost:4103/auth/login" &
check chatwoot "Chatwoot (port 4104)"      "http://localhost:4104/api" &
wait

say ""
say "  ${B}Hub:${RS} http://localhost:$HUB_PORT"
[ "$BROWSER" = "1" ] && is_mac && open "http://localhost:$HUB_PORT"
exit 0
