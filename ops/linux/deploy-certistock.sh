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
NODE_BIN="${NODE_BIN:-/usr/bin/node}"

SWITCHED=0
PREVIOUS_RELEASE=""

rollback_release() {
  if [[ "$SWITCHED" -eq 1 && -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
    systemctl restart certistock-api.service || true
    if systemctl is-enabled --quiet certistock-ocr.service 2>/dev/null || systemctl is-active --quiet certistock-ocr.service 2>/dev/null; then
      systemctl restart certistock-ocr.service || true
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

export DATABASE_URL="${DATABASE_URL:-$(grep -E '^DATABASE_URL=' "$APP_ROOT/shared/env" | tail -n 1 | cut -d= -f2-)}"
if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL missing from $APP_ROOT/shared/env" >&2
  exit 1
fi

PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"

echo "Creating predeploy backup"
BACKUP_ROOT="$BACKUP_ROOT" APP_ROOT="$APP_ROOT" /usr/local/bin/certistock-backup.sh predeploy

cd "$REPO_ROOT"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  npm ci
  npm run test
  npm run server:build
  VITE_BACKEND_MODE=local npm run build
fi

mkdir -p "$RELEASE_DIR"

rsync -a --delete --filter="merge $RSYNC_FILTER" \
  "$REPO_ROOT/" "$RELEASE_DIR/"

if [[ -f "$APP_ROOT/shared/env" ]]; then
  install -m 600 "$APP_ROOT/shared/env" "$RELEASE_DIR/server/.env"
  install -m 600 "$APP_ROOT/shared/env" "$RELEASE_DIR/.env"
fi

pushd "$RELEASE_DIR" >/dev/null
npm ci --omit=dev
popd >/dev/null

if [[ -f "$RELEASE_DIR/ocr-worker/requirements.txt" ]]; then
  python3 -m venv "$SHARED_ROOT/venvs/ocr-worker"
  "$SHARED_ROOT/venvs/ocr-worker/bin/python" -m pip install --upgrade pip
  "$SHARED_ROOT/venvs/ocr-worker/bin/python" -m pip install -r "$RELEASE_DIR/ocr-worker/requirements.txt"
  if [[ -f "$RELEASE_DIR/ocr-worker/requirements-paddleocr.txt" ]]; then
    "$SHARED_ROOT/venvs/ocr-worker/bin/python" -m pip install -r "$RELEASE_DIR/ocr-worker/requirements-paddleocr.txt"
  fi
fi

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
SWITCHED=1
systemctl restart certistock-api.service

if systemctl list-unit-files | grep -q '^certistock-ocr.service'; then
  systemctl restart certistock-ocr.service || true
fi

OCR_REQUIRED=true /usr/local/bin/certistock-health-check.sh
find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d | sort | head -n -5 | xargs -r rm -rf
echo "CertiStock deploy completed: $RELEASE_DIR"
echo "Rollback command: sudo /usr/local/bin/rollback-certistock.sh previous"
