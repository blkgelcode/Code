#!/usr/bin/env bash
# Back up all Studio OS data into backups/<date>/.
#
#   ./backup.sh               databases, Docker volumes, .env and the desktop apps' data
#   ./backup.sh --skip-media  leave out Cap's recordings (they can be huge)
#
# What's inside a backup:
#   calcom.dump, chatwoot.dump   full database dumps (taken while running, consistent)
#   vol-*.tar.gz                 Docker volumes: OpenSEO's data, Chatwoot uploads/Redis
#   apps-*.tar.gz                desktop app data from ~/Library/Application Support
#   env.backup                   your .env. It holds every secret: keep backups private
#   MANIFEST.txt                 what was saved, versions, and sizes
#
# Set BACKUP_COPY_TO in .env (e.g. /Volumes/T7/studio-os-backups) to also copy
# each backup to an external drive. Restore with ./restore.sh <backup folder>.

set -u
. "$(dirname "$0")/lib/common.sh"

MEDIA=1
for a in "$@"; do
  case "$a" in
    --skip-media) MEDIA=0 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $a" ;;
  esac
done

STAMP="$(date +%Y-%m-%d_%H%M)"
DEST="$STUDIO_DIR/backups/$STAMP"
mkdir -p "$DEST"; chmod 700 "$STUDIO_DIR/backups" "$DEST"
MAN="$DEST/MANIFEST.txt"
printf 'Studio OS backup %s\nhost: %s\n\n' "$STAMP" "$(hostname)" > "$MAN"
ERRORS=0

head1 "Backing up to backups/$STAMP"
ensure_docker
PROJECT="studio-os"
TAR_IMAGE="postgres:16-alpine"   # already on disk for Cal.com; has tar

# ── 1. Databases: logical dumps (safe while the apps run) ──
dump_db() {  # dump_db <service> <user> <db> <file>
  local was_up=1
  compose ps --status running -q "$1" 2>/dev/null | grep -q . || was_up=0
  if [ "$was_up" = "0" ]; then
    docker volume inspect "${PROJECT}_${1//-/_}" >/dev/null 2>&1 || { say "  ${DIM}–  $1: not installed, skipped${RS}"; return; }
    compose up -d "$1" >/dev/null 2>&1; sleep 5
  fi
  if compose exec -T "$1" pg_dump -U "$2" -d "$3" -Fc > "$DEST/$4"; then
    ok "$4 ($(du -h "$DEST/$4" | cut -f1))"; echo "db   $4  $(du -h "$DEST/$4" | cut -f1)" >> "$MAN"
  else
    fail "Couldn't dump $1"; ERRORS=$((ERRORS + 1)); rm -f "$DEST/$4"
  fi
  [ "$was_up" = "0" ] && compose stop "$1" >/dev/null 2>&1
}
dump_db calcom-db   calcom   calcom   calcom.dump
dump_db chatwoot-db postgres chatwoot chatwoot.dump

# ── 2. Docker volumes: file archives ──
tar_volume() {  # tar_volume <volume short name>
  local vol="${PROJECT}_$1"
  docker volume inspect "$vol" >/dev/null 2>&1 || { say "  ${DIM}–  $1: not created yet, skipped${RS}"; return; }
  if docker run --rm -v "$vol":/data:ro -v "$DEST":/backup "$TAR_IMAGE" \
       tar czf "/backup/vol-$1.tar.gz" -C /data . 2>/dev/null; then
    ok "vol-$1.tar.gz ($(du -h "$DEST/vol-$1.tar.gz" | cut -f1))"; echo "vol  $1  $(du -h "$DEST/vol-$1.tar.gz" | cut -f1)" >> "$MAN"
  else
    fail "Couldn't archive volume $1"; ERRORS=$((ERRORS + 1))
  fi
}
# OpenSEO: its own docs say to pause the app while its storage is archived.
SEO_UP=0; compose ps --status running -q seo-runtime 2>/dev/null | grep -q . && SEO_UP=1
[ "$SEO_UP" = "1" ] && { say "  ${DIM}Pausing OpenSEO for a moment…${RS}"; compose stop seo-web seo-crawl-gateway seo-runtime seo-storage >/dev/null 2>&1; }
for v in seo_storage seo_runtime seo_config; do tar_volume "$v"; done
[ "$SEO_UP" = "1" ] && compose up -d seo-web >/dev/null 2>&1 && ok "OpenSEO back up"
for v in chatwoot_storage chatwoot_redis; do tar_volume "$v"; done

# ── 3. Your keys ──
if [ -f "$ENV_FILE" ]; then cp "$ENV_FILE" "$DEST/env.backup"; chmod 600 "$DEST/env.backup"; ok "env.backup (secrets: keep private)"; fi

# ── 4. Desktop app data ──
backup_app() {  # backup_app <label> <dir names under Application Support…>
  local label="$1"; shift
  local base="$HOME/Library/Application Support" n
  local names=()
  for n in "$@"; do [ -d "$base/$n" ] && names+=("$n"); done
  if [ "${#names[@]}" -eq 0 ]; then say "  ${DIM}–  $label: no data folder found${RS}"; return; fi
  # Skip things the apps re-download or rebuild: model weights, Python envs, caches.
  local excl=(--exclude '*/Cache' --exclude '*/Caches' --exclude '*/GPUCache' --exclude '*/Code Cache'
              --exclude '*/models' --exclude '*/huggingface' --exclude '*.safetensors' --exclude '*.gguf'
              --exclude '*/python' --exclude '*/venv' --exclude '*/.venv')
  [ "$MEDIA" = "0" ] && excl+=(--exclude '*/recordings')
  if tar czf "$DEST/apps-$label.tar.gz" "${excl[@]}" -C "$base" "${names[@]}" 2>/dev/null; then
    ok "apps-$label.tar.gz ($(du -h "$DEST/apps-$label.tar.gz" | cut -f1))"
    echo "app  $label  $(du -h "$DEST/apps-$label.tar.gz" | cut -f1)  [${names[*]}]" >> "$MAN"
  else
    fail "Couldn't archive $label data"; ERRORS=$((ERRORS + 1))
  fi
}
if is_mac; then
  backup_app appflowy   AppFlowy AppFlowy-Data com.appflowy.appflowy.flutter io.appflowy.appflowy
  backup_app openwhispr OpenWhispr open-whispr
  backup_app voicestudio VoiceStudio OmniVoice com.debpalash.omnivoice-studio
  backup_app cap        so.cap.desktop so.cap.desktop.dev Cap
  say "  ${DIM}Model weights and caches are skipped: the apps re-download them.${RS}"
fi

# ── 5. Versions ──
{
  echo ""; echo "images:"
  compose images 2>/dev/null | tail -n +2 | awk '{print "  " $2 ":" $3}' | sort -u
  for d in "$STUDIO_DIR"/src/*/; do [ -d "$d/.git" ] && echo "  src $(basename "$d") @ $(git -C "$d" rev-parse --short HEAD)"; done
} >> "$MAN"

# ── 6. Copy off this Mac ──
COPY_TO="$(env_get BACKUP_COPY_TO)"
if [ -n "$COPY_TO" ]; then
  if [ -d "$(dirname "$COPY_TO")" ]; then
    mkdir -p "$COPY_TO" && cp -R "$DEST" "$COPY_TO/" && ok "Copied to $COPY_TO/$STAMP"
  else
    warn "BACKUP_COPY_TO ($COPY_TO) isn't connected; backup kept on this Mac only."
  fi
fi

say ""
say "  ${B}Backup:${RS} backups/$STAMP  ($(du -sh "$DEST" | cut -f1))"
[ "$ERRORS" -gt 0 ] && { warn "$ERRORS part(s) failed, see above."; exit 1; }
exit 0
