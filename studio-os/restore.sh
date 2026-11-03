#!/usr/bin/env bash
# Restore a backup made by ./backup.sh.
#
#   ./restore.sh backups/2026-11-03_1430            databases + Docker volumes
#   ./restore.sh backups/2026-11-03_1430 --apps     …and the desktop apps' data too
#
# This REPLACES the current data of the tools it restores. It asks first.

set -u
. "$(dirname "$0")/lib/common.sh"

SRC="${1:-}"; APPS=0; [ "${2:-}" = "--apps" ] && APPS=1
[ -n "$SRC" ] && [ -d "$SRC" ] || die "Usage: ./restore.sh backups/<date> [--apps]"
SRC="$(cd "$SRC" && pwd)"
PROJECT="studio-os"; TAR_IMAGE="postgres:16-alpine"

head1 "Restore from $(basename "$SRC")"
cat "$SRC/MANIFEST.txt" 2>/dev/null | sed 's/^/  /'
ask "This replaces the current data in those tools. Continue?" n || exit 0

ensure_docker
[ -f "$SRC/env.backup" ] && [ ! -f "$ENV_FILE" ] && { cp "$SRC/env.backup" "$ENV_FILE"; chmod 600 "$ENV_FILE"; ok "Restored .env"; }

compose --profile '*' down >/dev/null 2>&1

restore_db() {  # restore_db <service> <user> <db> <file>
  [ -f "$SRC/$4" ] || return 0
  compose up -d "$1" >/dev/null && sleep 6
  compose exec -T "$1" pg_restore -U "$2" -d "$3" --clean --if-exists --no-owner < "$SRC/$4" \
    && ok "Restored $4" || warn "pg_restore reported problems for $4 (often harmless notices)"
  compose stop "$1" >/dev/null
}
restore_db calcom-db   calcom   calcom   calcom.dump
restore_db chatwoot-db postgres chatwoot chatwoot.dump

for f in "$SRC"/vol-*.tar.gz; do
  [ -f "$f" ] || continue
  v="$(basename "$f" .tar.gz)"; v="${v#vol-}"
  docker volume create "${PROJECT}_$v" >/dev/null
  docker run --rm -v "${PROJECT}_$v":/data -v "$SRC":/backup:ro "$TAR_IMAGE" \
    sh -c "find /data -mindepth 1 -delete && tar xzf /backup/vol-$v.tar.gz -C /data" && ok "Restored volume $v"
done

if [ "$APPS" = "1" ] && is_mac; then
  "$STUDIO_DIR/stop.sh" >/dev/null 2>&1
  for f in "$SRC"/apps-*.tar.gz; do
    [ -f "$f" ] && tar xzf "$f" -C "$HOME/Library/Application Support" && ok "Restored $(basename "$f")"
  done
fi

ok "Done. Run ./start.sh"
