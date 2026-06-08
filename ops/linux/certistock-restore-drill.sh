#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:?Usage: certistock-restore-drill.sh /backups/certistock/monthly/YYYYMMDD_HHMMSS}"
DRILL_DB="${DRILL_DB:-certistock_restore_drill}"
OWNER="${DRILL_OWNER:-certistock_app}"

if [[ ! -f "$BACKUP_DIR/certistock.dump" ]]; then
  echo "Missing certistock.dump in $BACKUP_DIR" >&2
  exit 1
fi

dropdb --if-exists "$DRILL_DB"
createdb -O "$OWNER" "$DRILL_DB"
pg_restore -d "$DRILL_DB" "$BACKUP_DIR/certistock.dump"
psql -d "$DRILL_DB" -c "select count(*) as app_users from app_users;"
psql -d "$DRILL_DB" -c "select count(*) as uploaded_files from uploaded_files;"
echo "Restore drill completed against database $DRILL_DB"
