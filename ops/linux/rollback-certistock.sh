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
systemctl restart certistock-api.service
if systemctl is-enabled --quiet certistock-ocr.service 2>/dev/null || systemctl is-active --quiet certistock-ocr.service 2>/dev/null; then
  systemctl restart certistock-ocr.service || true
fi
"$HEALTH_CHECK"
echo "Rolled back CertiStock to $TARGET_DIR"
