#!/usr/bin/env bash
# Verification pass: restart everything from scratch and confirm all 8 tools come up.
#
#   ./verify.sh            stop everything, start it again, check every tool, log the result
#   ./verify.sh --no-restart   just check what's running now
#
# Writes a "Verification" section to SETUP_LOG.md and exits 1 if anything failed.

set -u
. "$(dirname "$0")/lib/common.sh"

RESTART=1; [ "${1:-}" = "--no-restart" ] && RESTART=0
DISABLED=",$(env_get STUDIO_DISABLED | tr -d ' '),"
disabled() { case "$DISABLED" in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

log_section "Verification"
RESULTS="$STUDIO_DIR/run/verify.txt"; mkdir -p "$STUDIO_DIR/run"; : > "$RESULTS"
res() { printf '%s|%s|%s\n' "$1" "$2" "$3" >> "$RESULTS"; log_result "$1" "$2" "$3"; }

if [ "$RESTART" = "1" ]; then
  head1 "1 · Stopping everything"
  "$STUDIO_DIR/stop.sh"
  sleep 3
  # Confirm it really is down before starting again.
  STILL=""
  for p in 4000 4101 4102 4103 4104; do http_ok "http://localhost:$p/" && STILL="$STILL $p"; done
  if [ -n "$STILL" ]; then res "Clean stop" FAIL "Ports still answering after stop:$STILL"; else res "Clean stop" PASS "All ports closed, containers removed, apps quit."; fi

  head1 "2 · Starting from scratch"
  WAIT_SECS=420 "$STUDIO_DIR/start.sh" --no-browser
fi

head1 "3 · Checking all 8 tools"
check_web() {  # check_web <id> <label> <url> <compose service for logs>
  if disabled "$1"; then res "$2" SKIP "Turned off in STUDIO_DISABLED."; return; fi
  if wait_http "$3" 420; then
    res "$2" PASS "$3 answers."
  else
    local st; st="$(compose ps -a --format '{{.Service}}: {{.State}} {{.Status}}' "$4" 2>/dev/null | head -n 1)"
    local why; why="$(compose logs --tail 3 --no-log-prefix "$4" 2>/dev/null | tr '\n' ' ' | cut -c1-220)"
    res "$2" FAIL "$3 not answering. Container: ${st:-not created}. Last log: ${why:-none}"
  fi
}
check_app() {  # check_app <id> <label> <App name>
  if disabled "$1"; then res "$2" SKIP "Turned off in STUDIO_DISABLED."; return; fi
  if ! is_mac; then res "$2" SKIP "Not on a Mac."; return; fi
  if ! app_path "$3" >/dev/null; then res "$2" FAIL "$3.app isn't installed. Run ./install.sh $1"; return; fi
  if app_running "$3" || wait_app "$3" 60; then res "$2" PASS "$3 launches."; else res "$2" FAIL "$3 is installed but didn't launch."; fi
}

VT="$(video_tool)"
check_web video    "1. Video & image ($VT)"     "http://localhost:4101/"             "$VT" &
check_app voice    "2. Voice (VoiceStudio)"     VoiceStudio
check_web seo      "3. SEO (OpenSEO)"           "http://localhost:4102/api/health"   seo-runtime &
check_app notes    "4. Notes (AppFlowy)"        AppFlowy
check_app dictation "5. Dictation (OpenWhispr)" OpenWhispr
check_web calcom   "6. Scheduling (Cal.com)"    "http://localhost:4103/auth/login"   calcom &
check_web chatwoot "7. Inbox (Chatwoot)"        "http://localhost:4104/api"          chatwoot-rails &
check_app record   "8. Screen recording (Cap)"  Cap
wait

# VoiceStudio's engine is a separate process from its window; report it, but don't fail on it.
if is_mac && app_running VoiceStudio; then
  if wait_http "http://localhost:3900/health" 90; then log_line "  - VoiceStudio engine answers on :3900."
  else res "2b. VoiceStudio engine" WARN "Window is open but the engine on :3900 isn't answering (still setting up, or no model chosen yet)."; fi
fi
if http_ok "http://localhost:$HUB_PORT/api/status"; then res "Hub" PASS "http://localhost:$HUB_PORT loads."; else res "Hub" FAIL "Hub isn't answering. See logs/hub.log."; fi

head1 "Result"
FAILS=0
sort "$RESULTS" | while IFS='|' read -r n s d; do
  case "$s" in PASS) ok "$n" ;; SKIP|WARN) warn "$n: $d" ;; *) fail "$n: $d" ;; esac
done
FAILS="$(grep -c '|FAIL|' "$RESULTS")"
if [ "$FAILS" = "0" ]; then
  log_line ""; log_line "**All tools came up.**"
  say ""; ok "${B}Everything came up.${RS} Logged in SETUP_LOG.md."
  exit 0
fi
log_line ""; log_line "**$FAILS check(s) failed**: see above."
say ""; fail "$FAILS check(s) failed. Details are in SETUP_LOG.md (and README → Troubleshooting)."
exit 1
