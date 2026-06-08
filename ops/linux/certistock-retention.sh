#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/certistock}"
ARCHIVE_ROOT="${ARCHIVE_ROOT:-/opt/backups/certistock/archive}"
DATA_ROOT="${DATA_ROOT:-/srv/certistock/data}"
LOG_DIR="$BACKUP_ROOT/logs"
STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$ARCHIVE_ROOT" "$LOG_DIR"
exec > >(tee -a "$LOG_DIR/retention-$STAMP.log") 2>&1

echo "Applying backup retention"
find "$BACKUP_ROOT/daily" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
find "$BACKUP_ROOT/weekly" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
find "$BACKUP_ROOT/predeploy" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
find "$LOG_DIR" -type f -mtime +30 -delete

echo "Creating yearly cold archive candidate for files older than 395 days"
YEAR="$(date +%Y)"
COLD_DIR="$ARCHIVE_ROOT/$YEAR/files-older-than-395-days-$STAMP"
mkdir -p "$COLD_DIR"

if [[ -d "$DATA_ROOT/files" ]]; then
  find "$DATA_ROOT/files" -type f -mtime +395 -print0 |
    while IFS= read -r -d '' file; do
      rel="${file#$DATA_ROOT/files/}"
      mkdir -p "$COLD_DIR/$(dirname "$rel")"
      mv "$file" "$COLD_DIR/$rel"
    done
fi

if find "$COLD_DIR" -type f | grep -q .; then
  tar --zstd -cf "$COLD_DIR.tar.zst" -C "$(dirname "$COLD_DIR")" "$(basename "$COLD_DIR")"
  sha256sum "$COLD_DIR.tar.zst" > "$COLD_DIR.tar.zst.sha256"
  rm -rf "$COLD_DIR"
  echo "Archive written: $COLD_DIR.tar.zst"
else
  rmdir "$COLD_DIR"
  echo "No cold files to archive"
fi
