#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/certistock
TARGET="${1:-previous}"

cd "$APP_DIR"

if [[ "$TARGET" == "previous" ]]; then
  if [[ ! -f "/opt/backups/deploy-history.log" ]]; then
    echo "No deploy-history.log found for previous rollback." >&2
    exit 1
  fi
  # Read the second-to-last deployed commit hash from the log
  TARGET_COMMIT=$(tail -n 2 /opt/backups/deploy-history.log | head -n 1 | sed 's/.* - //')
else
  TARGET_COMMIT="$TARGET"
fi

if [[ -z "$TARGET_COMMIT" ]]; then
  echo "Target commit is empty." >&2
  exit 1
fi

echo "Rolling back to commit: $TARGET_COMMIT"

git fetch origin
git reset --hard "$TARGET_COMMIT"
git clean -fd

export CERTISTOCK_ENV_FILE="$APP_DIR/.env"
set -a
# shellcheck disable=SC1090
source "$APP_DIR/.env"
set +a

echo "Removing non-server Windows/Electron artifacts..."
find "$APP_DIR" -type f \( -name "*.exe" -o -name "*.msi" -o -name "*.dmg" \) -delete
rm -rf "$APP_DIR/dist-electron" "$APP_DIR/release"

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
    echo "Health check failed after rollback!"
    exit 1
}

echo "Rollback to $TARGET_COMMIT complete."