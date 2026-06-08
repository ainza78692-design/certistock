#!/usr/bin/env bash
set -euo pipefail

TYPE="${1:-daily}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/certistock}"
APP_ROOT="${APP_ROOT:-/opt/apps/certistock}"
DATA_ROOT="${DATA_ROOT:-/srv/certistock/data}"
DATABASE_URL="${DATABASE_URL:-}"
LOG_DIR="$BACKUP_ROOT/logs"
TARGET="$BACKUP_ROOT/$TYPE/$STAMP"
LOG_FILE="$LOG_DIR/backup-$TYPE-$STAMP.log"

mkdir -p "$TARGET" "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

if [[ -z "$DATABASE_URL" && -f "$APP_ROOT/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_ROOT/.env" | tail -n 1 | cut -d= -f2-)"
elif [[ -z "$DATABASE_URL" && -f "$APP_ROOT/shared/env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_ROOT/shared/env" | tail -n 1 | cut -d= -f2-)"
fi

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL missing" >&2
  exit 1
fi

echo "Starting $TYPE backup $STAMP"
pg_dump "$DATABASE_URL" -Fc -f "$TARGET/certistock.dump"
pg_restore --list "$TARGET/certistock.dump" > "$TARGET/certistock.dump.list"

if [[ -d "$DATA_ROOT/files" ]]; then
  tar --zstd -cf "$TARGET/files.tar.zst" -C "$DATA_ROOT" files
fi

if [[ -f "$APP_ROOT/.env" ]]; then
  install -m 600 "$APP_ROOT/.env" "$TARGET/certistock.env"
elif [[ -f "$APP_ROOT/shared/env" ]]; then
  install -m 600 "$APP_ROOT/shared/env" "$TARGET/certistock.env"
fi

sha256sum "$TARGET"/* > "$TARGET/SHA256SUMS"
echo "Backup completed at $TARGET"
