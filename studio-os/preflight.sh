#!/usr/bin/env bash
# Phase 0: look at this Mac before installing anything.
# Reads only. The one thing it writes is a section in SETUP_LOG.md (and, if .env
# already exists, the right Cal.com image tag for your chip).
#
#   ./preflight.sh          print the report
#   ./preflight.sh --quiet  just the verdicts (used by install.sh)

set -u
. "$(dirname "$0")/lib/common.sh"

QUIET=0; [ "${1:-}" = "--quiet" ] && QUIET=1

if ! is_mac; then
  warn "This isn't a Mac ($(uname -s)). Studio OS is built for macOS; the checks below are partial."
fi

# ── Hardware ──
ARCH="$(uname -m)"
if is_mac && [ "$(sysctl -in sysctl.proc_translated 2>/dev/null)" = "1" ]; then ARCH="arm64"; fi  # Terminal running under Rosetta
CHIP="$( (is_mac && sysctl -n machdep.cpu.brand_string) 2>/dev/null || uname -m)"
if is_mac; then
  RAM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
  MACOS="$(sw_vers -productVersion)"
else
  RAM_GB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1048576 ))
  MACOS="n/a"
fi
FREE_GB=$(( $(df -Pk "$HOME" | awk 'NR==2 {print $4}') / 1048576 ))
MACOS_MAJOR="${MACOS%%.*}"; MACOS_MINOR="$(echo "$MACOS" | cut -d. -f2)"; [ "$MACOS_MINOR" = "$MACOS" ] && MACOS_MINOR=0

# ── Software ──
ver() { "$@" 2>/dev/null | head -n 1; }
BREW="$(have brew && ver brew --version)"
NODE="$(have node && ver node -v)"
BUN="$(have bun && ver bun --version)"
FFMPEG="$(have ffmpeg && ver ffmpeg -version | awk '{print $3}')"
GIT="$(have git && ver git --version | awk '{print $3}')"
DOCKER="$(have docker && ver docker --version | sed 's/Docker version //; s/,.*//')"
COMPOSE="$(have docker && docker compose version --short 2>/dev/null)"
DOCKER_RUNNING=0; DOCKER_MEM_GB=""
if [ -n "$DOCKER" ] && docker_up; then
  DOCKER_RUNNING=1
  DOCKER_MEM_GB=$(( $(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0) / 1073741824 ))
fi
NODE_MAJOR="$(echo "${NODE#v}" | cut -d. -f1)"

row() { printf '  %-22s %s\n' "$1" "$2"; }
yes_no() { if [ -n "$1" ]; then printf '%s✓%s %s' "$GR" "$RS" "$1"; else printf '%s✗ not installed%s' "$OR" "$RS"; fi; }

if [ "$QUIET" = "0" ]; then
  head1 "Phase 0 · Your Mac"
  row "Chip" "$CHIP ($ARCH)"
  row "Memory" "${RAM_GB} GB"
  row "Free disk (home)" "${FREE_GB} GB"
  row "macOS" "$MACOS"
  head1 "Phase 0 · Software"
  row "Homebrew" "$(yes_no "$BREW")"
  row "Docker" "$(yes_no "$DOCKER")$( [ -n "$DOCKER" ] && { [ "$DOCKER_RUNNING" = 1 ] && printf ' · running, %s GB allotted' "$DOCKER_MEM_GB" || printf ' · %snot running%s' "$OR" "$RS"; } )"
  row "Docker Compose" "$(yes_no "$COMPOSE")"
  row "Node.js" "$(yes_no "$NODE")"
  row "Bun" "$(yes_no "$BUN")  ${DIM}(not needed: only for building VoiceStudio from source)${RS}"
  row "ffmpeg" "$(yes_no "$FFMPEG")  ${DIM}(not needed: VoiceStudio and Cap bring their own)${RS}"
  row "git" "$(yes_no "$GIT")"
fi

# ── Verdicts: what this hardware can and can't do locally ──
# Each verdict: OK | LIMITED | NO
VERDICTS=""
verdict() { VERDICTS="$VERDICTS$1|$2|$3
"; }

# 1. Video generation
verdict "Video & image gen" "LIMITED" "No Mac can generate video locally with these tools: both send each job to a paid cloud API (Higgsfield or MuAPI). The app itself is light and runs fine."

# 2. VoiceStudio
if [ "$ARCH" != "arm64" ]; then
  verdict "VoiceStudio" "NO" "Intel Mac: the local voice engine can't install (no PyTorch for Intel Macs). Only the app's UI runs, connected to a backend on another computer."
elif [ "$MACOS_MAJOR" -lt 13 ] || { [ "$MACOS_MAJOR" -eq 13 ] && [ "$MACOS_MINOR" -lt 3 ]; }; then
  verdict "VoiceStudio" "NO" "Needs macOS 13.3 or newer (you have $MACOS)."
elif [ "$RAM_GB" -lt 16 ]; then
  verdict "VoiceStudio" "LIMITED" "${RAM_GB} GB of memory: stick to the smaller voice models, and don't run it alongside the Docker tools."
else
  verdict "VoiceStudio" "OK" "Apple Silicon with Metal acceleration. Needs about 10 GB of disk for the app and models."
fi

# 3. Docker server tools (OpenSEO + Cal.com + Chatwoot + video app ≈ 5–6 GB inside Docker)
if [ "$RAM_GB" -lt 8 ]; then
  verdict "Server tools (Docker)" "NO" "${RAM_GB} GB of memory isn't enough for OpenSEO, Cal.com and Chatwoot together (they need about 6 GB). Use their hosted versions instead."
elif [ "$RAM_GB" -lt 16 ]; then
  verdict "Server tools (Docker)" "LIMITED" "${RAM_GB} GB Mac: the full Docker stack (about 6 GB) leaves little room for your editor. Run it only when you need it (./stop.sh after), or keep OpenSEO off."
else
  verdict "Server tools (Docker)" "OK" "Give Docker Desktop at least 8 GB (Settings, then Resources)."
fi

# 5. OpenWhispr
if [ "$ARCH" != "arm64" ]; then
  verdict "OpenWhispr" "LIMITED" "Intel Mac: dictation works, but live speaker identification and voice fingerprinting don't."
elif [ "$RAM_GB" -lt 16 ]; then
  verdict "OpenWhispr" "OK" "Use the smaller local models (Parakeet or Whisper small). The large models want 16 GB."
else
  verdict "OpenWhispr" "OK" "Local Whisper and Parakeet models run well on Apple Silicon."
fi

verdict "AppFlowy" "OK" "Light, fully offline."
verdict "Cap" "OK" "Light. Long 4K recordings use disk fast: about 1 GB per 10 minutes."

# Disk (full install ≈ 35 GB: Docker images ~8 GB, VoiceStudio ~10 GB, dictation models ~3 GB, data)
if [ "$FREE_GB" -lt 15 ]; then
  verdict "Disk space" "NO" "Only ${FREE_GB} GB free. The full install needs about 35 GB. Free up space before installing anything."
elif [ "$FREE_GB" -lt 35 ]; then
  verdict "Disk space" "LIMITED" "${FREE_GB} GB free, but the full install needs about 35 GB. Free up space, or skip VoiceStudio (~10 GB)."
elif [ "$FREE_GB" -lt 60 ]; then
  verdict "Disk space" "LIMITED" "${FREE_GB} GB free. That's enough to install (~35 GB), but tight once recordings and backups pile up."
else
  verdict "Disk space" "OK" "${FREE_GB} GB free."
fi

# macOS / Docker Desktop support window
if is_mac && [ "$MACOS_MAJOR" -lt 14 ]; then
  verdict "macOS version" "LIMITED" "Current Docker Desktop releases support only the three newest macOS versions. On $MACOS you may be stuck on an old Docker; update macOS if you can."
fi

# Machine-readable copy for install.sh
mkdir -p "$STUDIO_DIR/run"
printf '%s' "$VERDICTS" > "$STUDIO_DIR/run/preflight.txt"

head1 "Phase 0 · What this Mac can handle locally"
CANT=0
printf '%s' "$VERDICTS" | while IFS='|' read -r name level text; do
  [ -z "$name" ] && continue
  case "$level" in
    OK)      printf '  %s✓ %-22s%s %s\n' "$GR" "$name" "$RS" "$text" ;;
    LIMITED) printf '  %s! %-22s%s %s\n' "$OR" "$name" "$RS" "$text" ;;
    NO)      printf '  %s✗ %-22s%s %s\n' "$RD" "$name" "$RS" "$text" ;;
  esac
done
printf '%s' "$VERDICTS" | grep -q '|NO|' && CANT=1

# ── Cal.com image for this chip ──
CAL_TAG="v6.2.0-arm"; [ "$ARCH" = "arm64" ] || CAL_TAG="v6.2.0"
if [ -f "$ENV_FILE" ] && [ "$(env_get CALCOM_IMAGE_TAG)" != "$CAL_TAG" ]; then
  env_set CALCOM_IMAGE_TAG "$CAL_TAG"
  ok "Set CALCOM_IMAGE_TAG=$CAL_TAG in .env for your chip"
fi

# ── Log it ──
log_section "Phase 0: Mac check"
log_line "- Chip: $CHIP ($ARCH) · Memory: ${RAM_GB} GB · Free disk: ${FREE_GB} GB · macOS: $MACOS"
log_line "- Homebrew: ${BREW:-missing} · Docker: ${DOCKER:-missing}$( [ "$DOCKER_RUNNING" = 1 ] && echo " (running, ${DOCKER_MEM_GB} GB)") · Compose: ${COMPOSE:-missing} · Node: ${NODE:-missing} · Bun: ${BUN:-missing} · ffmpeg: ${FFMPEG:-missing} · git: ${GIT:-missing}"
log_line ""
log_line "| Area | Verdict | Why |"
log_line "|---|---|---|"
printf '%s' "$VERDICTS" | while IFS='|' read -r name level text; do
  [ -n "$name" ] && log_line "| $name | $level | $text |"
done

# Node is needed for the hub; flag an old one.
if [ -n "$NODE" ] && [ "${NODE_MAJOR:-0}" -lt 18 ]; then
  warn "Node $NODE is too old for the hub (needs 18+). install.sh will offer to upgrade it with Homebrew."
fi

say ""
if [ "$CANT" = "1" ]; then
  warn "Some tools can't run on this Mac (✗ above). install.sh will skip those unless you force them."
  exit 2
fi
exit 0
