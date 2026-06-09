#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/apps/certistock}"
RELEASE_ROOT="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
HEALTH_CHECK="${HEALTH_CHECK:-/usr/local/bin/certistock-health-check.sh}"

TARGET="${1:-previous}"

if [[ "$TARGET" == "previous" ]]; then
  TARGET_DIR="$(find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 2 | head -n 1)"
else
  TARGET_DIR="$RELEASE_ROOT/$TARGET"
fi

if [[ -z "${TARGET_DIR:-}" || ! -d "$TARGET_DIR" ]]; then
  echo "Rollback target not found: $TARGET" >&2
  exit 1
fi

ln -sfn "$TARGET_DIR" "$CURRENT_LINK"
sudo -u certistock bash -lc "set -a; source '$APP_ROOT/shared/env'; set +a; pm2 startOrReload '$CURRENT_LINK/ecosystem.config.cjs' --only certistock-api --update-env"
systemctl restart certistock-ocr.service || true
"$HEALTH_CHECK"
echo "Rolled back CertiStock to $TARGET_DIR"