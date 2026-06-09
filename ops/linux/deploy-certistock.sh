#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/apps/certistock}"
REPO_ROOT="${REPO_ROOT:-$PWD}"
RELEASE_ROOT="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
SHARED_ROOT="${SHARED_ROOT:-$APP_ROOT/shared}"
LOG_DIR="${LOG_DIR:-/opt/logs/certistock}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/certistock}"
STAMP="$(date +%Y%m%d_%H%M%S)"
RELEASE_DIR="$RELEASE_ROOT/$STAMP"
DEPLOY_LOG="$LOG_DIR/deploy-$STAMP.log"
RSYNC_FILTER="$REPO_ROOT/ops/linux/deploy-rsync.exclude"

SWITCHED=0
PREVIOUS_RELEASE=""

rollback_release() {
  if [[ "$SWITCHED" -eq 1 && -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
    if command -v pm2 >/dev/null 2>&1; then
      sudo -u certistock bash -lc "set -a; source '$APP_ROOT/shared/env'; set +a; pm2 startOrReload '$APP_ROOT/current/ecosystem.config.cjs' --only certistock-api --update-env" || true
    fi
  fi
}

trap rollback_release ERR

mkdir -p "$RELEASE_ROOT" "$LOG_DIR" "$SHARED_ROOT/data/files" "$SHARED_ROOT/updates" "$SHARED_ROOT/venvs" "$BACKUP_ROOT"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

echo "CertiStock deploy started at $STAMP"
echo "Repository: $REPO_ROOT"

if [[ ! -f "$REPO_ROOT/package.json" ]]; then
  echo "package.json not found in $REPO_ROOT" >&2
  exit 1
fi

if [[ ! -f "$APP_ROOT/shared/env" ]]; then
  echo "$APP_ROOT/shared/env missing. Copy ops/linux/certistock.env.example and fill secrets." >&2
  exit 1
fi

export CERTISTOCK_ENV_FILE="$APP_ROOT/shared/env"
set -a
# shellcheck disable=SC1090
source "$APP_ROOT/shared/env"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL missing from $APP_ROOT/shared/env" >&2
  exit 1
fi

PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"

echo "Creating predeploy backup"
BACKUP_ROOT="$BACKUP_ROOT" APP_ROOT="$APP_ROOT" /usr/local/bin/certistock-backup.sh predeploy

echo "Applying database migration"
psql "$DATABASE_URL" -f "$REPO_ROOT/server/sql/001_local_postgres_schema.sql"

mkdir -p "$RELEASE_DIR"
rsync -a --delete --filter="merge $RSYNC_FILTER" \
  "$REPO_ROOT/" "$RELEASE_DIR/"

install -m 600 "$APP_ROOT/shared/env" "$RELEASE_DIR/.env"

cd "$RELEASE_DIR"
npm ci --omit=dev

if [[ ! -f "$RELEASE_DIR/ecosystem.config.cjs" ]]; then
  echo "ecosystem.config.cjs missing from release" >&2
  exit 1
fi

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
SWITCHED=1

sudo -u certistock bash -lc "set -a; source '$APP_ROOT/shared/env'; set +a; pm2 startOrReload '$CURRENT_LINK/ecosystem.config.cjs' --only certistock-api --update-env"
sudo -u certistock pm2 save

if systemctl list-unit-files | grep -q '^certistock-ocr.service'; then
  systemctl restart certistock-ocr.service || true
fi

OCR_REQUIRED=true /usr/local/bin/certistock-health-check.sh

find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d | sort | head -n -5 | xargs -r rm -rf
echo "CertiStock deploy completed: $RELEASE_DIR"
echo "Rollback command: sudo /usr/local/bin/rollback-certistock.sh previous"