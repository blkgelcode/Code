#!/usr/bin/env bash
# Shared helpers for the Studio OS scripts. Sourced, never run directly.
# Works with the bash 3.2 that ships with macOS (no associative arrays, no mapfile).

STUDIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$STUDIO_DIR/.env"
LOG_FILE="$STUDIO_DIR/SETUP_LOG.md"
TOOLS_JSON="$STUDIO_DIR/hub/tools.json"
HUB_PORT=4000

# Docker Desktop and Homebrew live outside the default PATH when a script is
# launched from Finder or a fresh shell.
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; OR=$'\033[38;5;208m'; GR=$'\033[32m'; RD=$'\033[31m'; RS=$'\033[0m'
else
  B=""; DIM=""; OR=""; GR=""; RD=""; RS=""
fi

say()   { printf '%s\n' "$*"; }
head1() { printf '\n%s━━ %s ━━%s\n' "$B$OR" "$*" "$RS"; }
ok()    { printf '  %s✓%s %s\n' "$GR" "$RS" "$*"; }
warn()  { printf '  %s!%s %s\n' "$OR" "$RS" "$*"; }
fail()  { printf '  %s✗%s %s\n' "$RD" "$RS" "$*"; }
die()   { fail "$*"; exit 1; }

is_mac() { [ "$(uname -s)" = "Darwin" ]; }
have()   { command -v "$1" >/dev/null 2>&1; }
now()    { date '+%Y-%m-%d %H:%M'; }

# ask "Question?" default(y|n)  → returns 0 for yes. ASSUME_YES=1 (install.sh --yes) answers yes to everything.
ask() {
  local q="$1" def="${2:-n}" ans hint="[y/N]"
  [ "$def" = "y" ] && hint="[Y/n]"
  if [ "${ASSUME_YES:-0}" = "1" ]; then return 0; fi
  if [ ! -t 0 ]; then [ "$def" = "y" ]; return; fi
  printf '  %s?%s %s %s ' "$OR" "$RS" "$q" "$hint"
  read -r ans
  ans="${ans:-$def}"
  case "$ans" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# ── .env access (never `source` it: values may contain spaces, < > or JSON) ──
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  local line
  line="$(grep -E "^[[:space:]]*$1=" "$ENV_FILE" | tail -n 1)" || true
  line="${line#*=}"
  # strip one layer of matching quotes
  case "$line" in
    \"*\") line="${line#\"}"; line="${line%\"}" ;;
    \'*\') line="${line#\'}"; line="${line%\'}" ;;
  esac
  printf '%s' "$line"
}

# env_set KEY VALUE — replace the line if present, otherwise append. Keeps the file private.
env_set() {
  local key="$1" val="$2" tmp
  tmp="$(mktemp "$STUDIO_DIR/.env.tmp.XXXXXX")"
  if grep -qE "^$key=" "$ENV_FILE"; then
    KEY="$key" VAL="$val" awk 'BEGIN{k=ENVIRON["KEY"]; v=ENVIRON["VAL"]}
      index($0, k"=")==1 {print k"="v; next} {print}' "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"; printf '%s=%s\n' "$key" "$val" >> "$tmp"
  fi
  mv "$tmp" "$ENV_FILE"; chmod 600 "$ENV_FILE"
}

video_tool() {
  local p; p="$(env_get COMPOSE_PROFILES)"
  case ",$p," in *,open-generative-ai,*) echo "open-generative-ai" ;; *) echo "open-higgsfield" ;; esac
}

# tool_field <id> <field>  → reads hub/tools.json with node (installed in prerequisites)
tool_field() {
  node -e '
    const t = require(process.argv[1]).tools.find(x => x.id === process.argv[2]);
    const v = t && t[process.argv[3]];
    if (v !== undefined) process.stdout.write(Array.isArray(v) ? v.join(" ") : String(v));
  ' "$TOOLS_JSON" "$1" "$2"
}

# ── Docker ──
compose() { (cd "$STUDIO_DIR" && docker compose "$@"); }

docker_up() { docker info >/dev/null 2>&1; }

ensure_docker() {
  have docker || die "Docker isn't installed. Run ./install.sh first."
  if docker_up; then return 0; fi
  is_mac && open -ga Docker >/dev/null 2>&1
  say "  ${DIM}Waiting for Docker Desktop to start…${RS}"
  local i=0
  while ! docker_up; do
    i=$((i + 1)); [ "$i" -gt 90 ] && die "Docker Desktop didn't start within 3 minutes. Open it from Applications, then try again."
    sleep 2
  done
  ok "Docker is running"
}

# ── Health checks ──
# http_ok URL → 0 if the server answers 2xx/3xx
http_ok() {
  local code
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$1" 2>/dev/null)" || true
  case "$code" in 2??|3??) return 0 ;; *) return 1 ;; esac
}

# wait_http URL SECONDS → polls until up or timeout
wait_http() {
  local url="$1" limit="${2:-120}" t=0
  while [ "$t" -lt "$limit" ]; do
    http_ok "$url" && return 0
    sleep 3; t=$((t + 3))
  done
  return 1
}

app_path() {
  local a
  for a in "/Applications/$1.app" "$HOME/Applications/$1.app"; do
    [ -d "$a" ] && { echo "$a"; return 0; }
  done
  return 1
}
app_running() { pgrep -f "$1.app/Contents/MacOS/" >/dev/null 2>&1; }

# wait_app NAME SECONDS → launches the app and waits for its process
wait_app() {
  local name="$1" limit="${2:-45}" t=0
  open -ga "$name" >/dev/null 2>&1 || return 1
  while [ "$t" -lt "$limit" ]; do
    app_running "$name" && return 0
    sleep 2; t=$((t + 2))
  done
  return 1
}

# ── SETUP_LOG.md ──
log_init() {
  [ -f "$LOG_FILE" ] && return 0
  cat > "$LOG_FILE" <<'EOF'
# Studio OS setup log

Every install, health check and verification run is appended here, newest at the bottom.

EOF
}
log_section() { log_init; printf '\n## %s · %s\n\n' "$1" "$(now)" >> "$LOG_FILE"; }
log_line()    { log_init; printf '%s\n' "$*" >> "$LOG_FILE"; }
# log_result TOOL PASS|FAIL|SKIP DETAIL
log_result() {
  local mark="✅"; [ "$2" = "FAIL" ] && mark="❌"; [ "$2" = "SKIP" ] && mark="⏭️"; [ "$2" = "WARN" ] && mark="⚠️"
  log_line "- $mark **$1**: $2. $3"
}
