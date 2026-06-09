#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/certistock
BACKUP_DIR=/opt/backups/deploys
DEPLOY_HISTORY=/opt/backups/deploy-history.log

# Ensure standard paths are available even when run via sudo
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if [ ! -d "$APP_DIR/.git" ]; then
    echo "Directory $APP_DIR does not have a git repository. Please clone the repository first or ensure it is initialized."
    exit 1
fi

cd "$APP_DIR"

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "$APP_DIR/.env missing. Please create it with required secrets." >&2
  exit 1
fi

export CERTISTOCK_ENV_FILE="$APP_DIR/.env"
set -a
# shellcheck disable=SC1090
source "$APP_DIR/.env"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL missing from $APP_DIR/.env" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$DEPLOY_HISTORY")"

echo "Creating predeploy backup..."
tar czf "$BACKUP_DIR/$(date +%Y%m%d-%H%M%S).tar.gz" --exclude=node_modules --exclude=.git --exclude=logs --exclude=tmp --exclude=cache .

echo "Fetching latest code..."
git fetch origin
git reset --hard origin/main
git clean -fd

echo "Removing non-server Windows/Electron artifacts..."
find "$APP_DIR" -type f \( -name "*.exe" -o -name "*.msi" -o -name "*.dmg" \) -delete
rm -rf "$APP_DIR/dist-electron" "$APP_DIR/release"

echo "Recording deployment history..."
echo "$(date +%Y-%m-%d_%H:%M:%S) - $(git rev-parse HEAD)" >> "$DEPLOY_HISTORY"

echo "Applying database migration..."
echo "WARNING: No migration framework detected. Falling back to raw psql execution."
echo "         Running raw SQL schema files repeatedly can be risky and non-idempotent."
echo "         Consider adopting a framework like Prisma, Knex, or Drizzle in the future."
psql "$DATABASE_URL" -f "server/sql/001_local_postgres_schema.sql"

echo "Installing Node dependencies..."
npm ci

if [ -f "ocr-worker/requirements.txt" ]; then
    echo "Installing Python dependencies..."
    pip install -r ocr-worker/requirements.txt || true
fi

echo "Building frontend and backend..."
npm run build
npm run server:build

echo "Reloading PM2..."
sudo -u certistock bash -lc "set -a; source '$APP_DIR/.env'; set +a; pm2 startOrReload ecosystem.config.cjs --only certistock-api --update-env"
sudo -u certistock pm2 save

echo "Restarting OCR worker if present..."
if systemctl list-unit-files | grep -q '^certistock-ocr.service'; then
  systemctl restart certistock-ocr.service || true
fi

echo "Running health check..."
curl -f http://localhost:8787/health || {
    echo "Health check failed! Deployment might be broken."
    exit 1
}
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -type f -mtime +30 -delete

echo "Deployment complete."