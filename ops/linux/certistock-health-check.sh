#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8787/health}"
OCR_URL="${OCR_URL:-http://127.0.0.1:8001/health}"
OCR_REQUIRED="${OCR_REQUIRED:-true}"

api_response="$(curl --fail --silent --show-error "$API_URL")"
echo "$api_response"

ocr_response="$(curl --fail --silent --show-error "$OCR_URL" || true)"
ocr_ok="$(printf '%s' "$ocr_response" | jq -r '.ok // false' 2>/dev/null || printf 'false')"

if [[ "$ocr_ok" == "true" ]]; then
  echo "OCR worker ok"
elif [[ "${OCR_REQUIRED,,}" == "true" ]]; then
  echo "OCR worker is required but not healthy at $OCR_URL" >&2
  exit 1
else
  echo "WARNING: OCR worker is not healthy at $OCR_URL" >&2
fi
