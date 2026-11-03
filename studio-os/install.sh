#!/usr/bin/env bash
# Install BLKGRLCO Studio OS, one tool at a time.
#
#   ./install.sh                 Phase 0 check, prerequisites, then all 8 tools in order
#   ./install.sh seo calcom      install (or repair) only these tools
#   ./install.sh dataforseo-key  turn your DataForSEO login into the key OpenSEO needs
#   ./install.sh --yes           answer yes to every question
#   ./install.sh --force         also install tools Phase 0 said this Mac can't run
#
# Tool ids: video voice seo notes dictation calcom chatwoot record
#
# After each tool it runs a health check (the URL loads, or the app launches)
# and writes the result to SETUP_LOG.md before moving on.

set -u
. "$(dirname "$0")/lib/common.sh"

ORDER="video voice seo notes dictation calcom chatwoot record"
FORCE=0; ASSUME_YES=0; ONLY=""
for a in "$@"; do
  case "$a" in
    --yes|-y) ASSUME_YES=1 ;;
    --force)  FORCE=1 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    dataforseo-key) ONLY="dataforseo-key" ;;
    video|voice|seo|notes|dictation|calcom|chatwoot|record) ONLY="$ONLY $a" ;;
    *) die "Unknown option or tool: $a (try --help)" ;;
  esac
done
export ASSUME_YES

is_mac || die "Studio OS installs on macOS. (This is $(uname -s).)"

# ─────────────────────────── DataForSEO key helper ───────────────────────────
make_dataforseo_key() {
  head1 "DataForSEO key"
  say "  Find your API login and password at https://app.dataforseo.com/api-access"
  say "  (the API password is NOT your website password; it's shown on that page)."
  local login pass
  printf '  API login (email): '; read -r login
  printf '  API password (hidden): '; stty -echo; read -r pass; stty echo; printf '\n'
  [ -n "$login" ] && [ -n "$pass" ] || die "Both are needed."
  [ -f "$ENV_FILE" ] || cp "$STUDIO_DIR/.env.example" "$ENV_FILE"
  env_set DATAFORSEO_API_KEY "$(printf '%s:%s' "$login" "$pass" | base64 | tr -d '\n')"
  unset pass
  ok "Saved DATAFORSEO_API_KEY to .env"
  if docker_up && compose ps --status running -q seo-runtime 2>/dev/null | grep -q .; then
    compose up -d --force-recreate seo-init seo-web seo-crawl-gateway >/dev/null 2>&1 && ok "OpenSEO restarted with the new key"
  fi
}
if [ "$ONLY" = "dataforseo-key" ]; then make_dataforseo_key; exit 0; fi

# ─────────────────────────────── Location ────────────────────────────────────
if [ "$STUDIO_DIR" != "$HOME/studio-os" ]; then
  if [ ! -e "$HOME/studio-os" ]; then
    if ask "Make ~/studio-os point to this folder ($STUDIO_DIR)?" y; then
      ln -s "$STUDIO_DIR" "$HOME/studio-os" && ok "~/studio-os → $STUDIO_DIR"
    fi
  elif [ "$(cd "$HOME/studio-os" && pwd -P)" != "$(cd "$STUDIO_DIR" && pwd -P)" ]; then
    warn "~/studio-os already exists and is a different folder. Using $STUDIO_DIR."
  fi
fi

# ─────────────────────────────── Phase 0 ─────────────────────────────────────
"$STUDIO_DIR/preflight.sh"
PF=$?
can_run() {  # can_run "VoiceStudio" → 1 if Phase 0 said NO
  [ "$FORCE" = "1" ] && return 0
  ! grep -q "^$1|NO|" "$STUDIO_DIR/run/preflight.txt" 2>/dev/null
}
grep -q '^Disk space|NO|' "$STUDIO_DIR/run/preflight.txt" 2>/dev/null && [ "$FORCE" = "0" ] && \
  die "Not enough free disk to install. Free up space (or use --force), then run ./install.sh again."
if [ -z "$ONLY" ]; then
  [ "$PF" = "2" ] && say "  Tools marked ✗ will be skipped."
  ask "Phase 0 looks done. Install now?" y || { say "  Nothing installed. Run ./install.sh when you're ready."; exit 0; }
fi

# ───────────────────────────── Prerequisites ─────────────────────────────────
head1 "Prerequisites"
log_section "Install"

if ! xcode-select -p >/dev/null 2>&1; then
  warn "Apple's Command Line Tools (git, make) are missing."
  xcode-select --install >/dev/null 2>&1 || true
  die "A window opened to install them. Finish it, then run ./install.sh again."
fi
ok "Command Line Tools"

if ! have brew; then
  ask "Homebrew isn't installed. Install it now (official installer, asks for your Mac password)?" y \
    || die "Homebrew is needed to install the apps. See https://brew.sh"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || die "Homebrew install failed."
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
fi
ok "Homebrew $(brew --version | head -n 1 | awk '{print $2}')"

NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ]; then
  ask "Node.js 18+ is needed for the hub. Install it with Homebrew?" y || die "Install Node.js 18+ and run again."
  brew install node || die "brew install node failed."
fi
ok "Node.js $(node -v)"

if ! have docker; then
  ask "Docker Desktop isn't installed. Install it with Homebrew? (free for personal use)" y \
    || die "Docker Desktop is needed for the server tools. https://www.docker.com/products/docker-desktop/"
  brew install --cask docker-desktop 2>/dev/null || brew install --cask docker || die "Docker Desktop install failed."
  say "  Docker Desktop opens next. Accept its terms, then come back here."
  open -a Docker || true
fi
ensure_docker
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing. Update Docker Desktop."
DMEM=$(( $(docker info --format '{{.MemTotal}}') / 1073741824 ))
if [ "$DMEM" -lt 6 ]; then
  warn "Docker Desktop has only ${DMEM} GB of memory. Raise it to 8 GB: Docker Desktop, then Settings, then Resources."
  log_result "Docker memory" WARN "Only ${DMEM} GB allotted; 8 GB recommended."
fi
ok "Docker $(docker --version | sed 's/Docker version //; s/,.*//') with ${DMEM} GB"
log_result "Prerequisites" PASS "Homebrew, Node $(node -v), Docker $(docker --version | sed 's/Docker version //; s/,.*//') (${DMEM} GB)."

# ─────────────────────────────── .env ────────────────────────────────────────
head1 "Keys file (.env)"
if [ ! -f "$ENV_FILE" ]; then
  cp "$STUDIO_DIR/.env.example" "$ENV_FILE"; chmod 600 "$ENV_FILE"
  ok "Created .env from .env.example (private to your user account)"
fi
gen() { [ -n "$(env_get "$1")" ] || { env_set "$1" "$2"; ok "Generated $1"; }; }
# Hex for passwords that end up inside database URLs (no / + = characters).
gen SEO_STORAGE_SECRET_KEY   "$(openssl rand -hex 32)"
gen CALCOM_DB_PASSWORD       "$(openssl rand -hex 24)"
gen CALCOM_NEXTAUTH_SECRET   "$(openssl rand -base64 32)"
gen CALCOM_ENCRYPTION_KEY    "$(openssl rand -base64 24)"   # 32 characters, as Cal.com's AES-256 needs
gen CHATWOOT_SECRET_KEY_BASE "$(openssl rand -hex 64)"
gen CHATWOOT_DB_PASSWORD     "$(openssl rand -hex 24)"
gen CHATWOOT_REDIS_PASSWORD  "$(openssl rand -hex 24)"
if [ -z "$(env_get CALCOM_VAPID_PUBLIC_KEY)" ]; then
  VAPID="$(npx --yes web-push generate-vapid-keys --json 2>/dev/null)" || VAPID=""
  if [ -n "$VAPID" ]; then
    env_set CALCOM_VAPID_PUBLIC_KEY  "$(printf '%s' "$VAPID" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).publicKey)')"
    env_set CALCOM_VAPID_PRIVATE_KEY "$(printf '%s' "$VAPID" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).privateKey)')"
    ok "Generated Cal.com push-notification (VAPID) keys"
  else
    warn "Couldn't generate VAPID keys (npx web-push). Cal.com still works; browser push notifications won't."
  fi
fi
chmod 600 "$ENV_FILE"
"$STUDIO_DIR/preflight.sh" --quiet >/dev/null 2>&1 || true   # writes the right CALCOM_IMAGE_TAG for this chip
log_result ".env" PASS "Secrets generated; API keys still to paste: see the hub's Status tab."

# ─────────────────────────────── The tools ───────────────────────────────────
SUMMARY=""
record() { SUMMARY="$SUMMARY$1|$2|$3
"; log_result "$1" "$2" "$3"; }

install_video() {
  local vt name repo dir url sha
  vt="$(video_tool)"
  if [ "$vt" = "open-generative-ai" ]; then
    name="Open Generative AI"; repo="https://github.com/Anil-matcha/Open-Generative-AI"
  else
    name="OpenHiggsfield"; repo="https://github.com/wide-trace/open-higgsfield"
    warn "Heads-up: open-higgsfield has no LICENSE file (all rights reserved by default),"
    warn "and it's a front end for Higgsfield's own paid API, not a local generator."
    ask "Install it anyway? (Say no, then set COMPOSE_PROFILES=open-generative-ai in .env for the MIT fallback.)" y \
      || { record "1. Video ($name)" SKIP "Declined (license). Switch to the fallback in .env and run ./install.sh video."; return; }
  fi
  dir="$STUDIO_DIR/src/$vt"
  mkdir -p "$STUDIO_DIR/src"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" pull --ff-only -q && git -C "$dir" submodule update --init --recursive -q 2>/dev/null
  else
    git clone -q --depth 1 --recursive --shallow-submodules "$repo" "$dir" || { record "1. Video ($name)" FAIL "git clone failed."; return; }
  fi
  sha="$(git -C "$dir" rev-parse --short HEAD)"
  say "  Building $name from source (first build takes a few minutes)…"
  compose build "$vt" || { record "1. Video ($name)" FAIL "Docker build failed: see the output above."; return; }
  compose up -d "$vt" >/dev/null || { record "1. Video ($name)" FAIL "Container didn't start."; return; }
  url="http://localhost:4101/"
  if wait_http "$url" 180; then
    record "1. Video ($name)" PASS "$url loads (commit $sha)."
  else
    record "1. Video ($name)" FAIL "$url didn't answer within 3 min. Try: docker compose logs $vt"
  fi
}

install_desktop() {  # install_desktop <id> <label>
  local id="$1" label="$2" app cask tap dl
  app="$(tool_field "$id" app)"; cask="$(tool_field "$id" brewCask)"; tap="$(tool_field "$id" brewTap)"; dl="$(tool_field "$id" download)"
  if app_path "$app" >/dev/null; then
    ok "$app is already installed"
  else
    [ -n "$tap" ] && { brew tap "$tap" >/dev/null 2>&1; brew trust --cask "$cask" >/dev/null 2>&1 || true; }
    if ! brew install --cask "$cask"; then
      record "$label" FAIL "brew install --cask $cask failed. Download it from $dl and drag it to Applications, then run ./install.sh $id."
      return
    fi
  fi
  if ! wait_app "$app" 60; then
    # Unsigned apps (VoiceStudio) can be blocked as "damaged" by Gatekeeper.
    if ask "$app didn't open. Clear macOS's download quarantine flag on it and try again?" y; then
      xattr -dr com.apple.quarantine "$(app_path "$app")" 2>/dev/null || true
      wait_app "$app" 60 || { record "$label" FAIL "Installed, but the app didn't launch. Open it from Applications to see the error."; return; }
    else
      record "$label" FAIL "Installed, but the app didn't launch."; return
    fi
  fi
  record "$label" PASS "$app.app installed and launches."
}

install_voice() {
  if ! can_run "VoiceStudio"; then record "2. Voice (VoiceStudio)" SKIP "Phase 0: this Mac can't run its local engine."; return; fi
  install_desktop voice "2. Voice (VoiceStudio)"
  if app_running VoiceStudio; then
    say "  Waiting for VoiceStudio's engine (the first launch downloads Python and FFmpeg; it can take a while)…"
    if wait_http "http://localhost:3900/health" 180; then
      log_line "  - VoiceStudio engine answers at http://localhost:3900/health."
    else
      warn "VoiceStudio opened, but its engine isn't answering yet. That's normal on the first launch; the Status tab will show it once it's ready."
      log_line "  - VoiceStudio engine not ready yet after 3 min (first-launch setup)."
    fi
  fi
}

install_compose_tool() {  # install_compose_tool <id> <label> <url> <seconds> "<services to start>" <services to pull...>
  local id="$1" label="$2" url="$3" secs="$4" start="$5"; shift 5
  if ! can_run "Server tools (Docker)"; then record "$label" SKIP "Phase 0: not enough memory for the Docker tools."; return; fi
  say "  Downloading images (only slow the first time)…"
  compose pull -q "$@" || { record "$label" FAIL "docker compose pull failed. Check your internet, then run ./install.sh $id."; return; }
  # shellcheck disable=SC2086  # $start is a list of service names
  compose up -d $start >/dev/null || { record "$label" FAIL "Containers didn't start. Try: docker compose logs $start"; return; }
  say "  Waiting for it to answer at $url (first start runs database setup)…"
  if wait_http "$url" "$secs"; then
    record "$label" PASS "$url answers."
  else
    record "$label" FAIL "$url didn't answer within $((secs / 60)) min. Try: docker compose logs --tail 50 ${start%% *}"
  fi
}

install_seo() {
  [ -n "$(env_get DATAFORSEO_API_KEY)" ] || warn "No DATAFORSEO_API_KEY yet. OpenSEO will start, but it can't fetch SEO data until you run ./install.sh dataforseo-key."
  install_compose_tool seo "3. SEO (OpenSEO)" "http://localhost:4102/api/health" 300 seo-web \
    seo-storage seo-runtime seo-init seo-crawl-gateway seo-web
}
install_calcom() {
  install_compose_tool calcom "6. Scheduling (Cal.com)" "http://localhost:4103/auth/login" 480 calcom calcom-db calcom
}
install_chatwoot() {
  install_compose_tool chatwoot "7. Inbox (Chatwoot)" "http://localhost:4104/api" 480 "chatwoot-rails chatwoot-sidekiq" \
    chatwoot-db chatwoot-redis chatwoot-rails chatwoot-sidekiq
}

TODO="${ONLY:-$ORDER}"
for t in $TODO; do
  case "$t" in
    video)     head1 "1/8 · Video & image generation"; install_video ;;
    voice)     head1 "2/8 · Voice (VoiceStudio)";      install_voice ;;
    seo)       head1 "3/8 · SEO (OpenSEO)";            install_seo ;;
    notes)     head1 "4/8 · Notes (AppFlowy)";         install_desktop notes "4. Notes (AppFlowy)" ;;
    dictation) head1 "5/8 · Dictation (OpenWhispr)";   install_desktop dictation "5. Dictation (OpenWhispr)" ;;
    calcom)    head1 "6/8 · Scheduling (Cal.com)";     install_calcom ;;
    chatwoot)  head1 "7/8 · Inbox (Chatwoot)";         install_chatwoot ;;
    record)    head1 "8/8 · Screen recording (Cap)";   install_desktop record "8. Screen recording (Cap)" ;;
  esac
  last="$(printf '%s' "$SUMMARY" | tail -n 1)"
  case "$last" in
    *"|PASS|"*) ok "Health check passed · logged in SETUP_LOG.md" ;;
    *"|SKIP|"*) warn "Skipped · logged in SETUP_LOG.md" ;;
    *"|FAIL|"*) fail "Health check failed · logged in SETUP_LOG.md"
                ask "Carry on with the next tool?" y || break ;;
  esac
done

# ─────────────────────────────── The hub ─────────────────────────────────────
head1 "The hub"
"$STUDIO_DIR/start.sh" --hub-only >/dev/null 2>&1 || true
if wait_http "http://localhost:$HUB_PORT/api/status" 20; then
  record "Hub" PASS "http://localhost:$HUB_PORT loads."
else
  record "Hub" FAIL "http://localhost:$HUB_PORT didn't load. See logs/hub.log."
fi

head1 "Summary"
printf '%s' "$SUMMARY" | while IFS='|' read -r n s d; do
  [ -z "$n" ] && continue
  case "$s" in PASS) ok "$n" ;; SKIP) warn "$n: skipped. $d" ;; WARN) warn "$n: $d" ;; *) fail "$n: $d" ;; esac
done
say ""
say "  Next: open ${B}http://localhost:$HUB_PORT${RS}, then the Status tab shows which keys are still missing."
say "  First-time setup inside each tool is in README.md → \"First run\"."
is_mac && open "http://localhost:$HUB_PORT" >/dev/null 2>&1 || true
