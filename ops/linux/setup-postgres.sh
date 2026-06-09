#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SCHEMA_FILE="${SCHEMA_FILE:-$ROOT_DIR/server/sql/001_local_postgres_schema.sql}"

if [[ -z "$DB_NAME" || -z "$DB_USER" || -z "$DB_PASSWORD" ]]; then
  if [[ -z "${DATABASE_URL:-}" && -f /opt/apps/certistock/shared/env ]]; then
    # shellcheck disable=SC1091
    source /opt/apps/certistock/shared/env
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is required when DB_* variables are not supplied" >&2
    exit 1
  fi

  parsed="$(python3 - <<'PY'
from urllib.parse import urlparse
import os

db = os.environ.get("DATABASE_URL", "")
u = urlparse(db)
print(u.path.lstrip("/") or "")
print(u.username or "")
print(u.password or "")
PY
  )"
  IFS=$'\n' read -r derived_db_name derived_db_user derived_db_password <<< "$parsed"
  DB_NAME="${DB_NAME:-$derived_db_name}"
  DB_USER="${DB_USER:-$derived_db_user}"
  DB_PASSWORD="${DB_PASSWORD:-$derived_db_password}"
fi

if [[ -z "$DB_NAME" || -z "$DB_USER" || -z "$DB_PASSWORD" ]]; then
  echo "Unable to determine database credentials" >&2
  exit 1
fi

sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

DB_NAME_ESCAPED="$(sql_escape "$DB_NAME")"
DB_USER_ESCAPED="$(sql_escape "$DB_USER")"
DB_PASSWORD_ESCAPED="$(sql_escape "$DB_PASSWORD")"

sudo -u postgres psql <<SQL
DO
\$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER_ESCAPED}') THEN
    CREATE ROLE ${DB_USER_ESCAPED} LOGIN PASSWORD '${DB_PASSWORD_ESCAPED}';
  END IF;
END
\$\$;

DO
\$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${DB_NAME_ESCAPED}') THEN
    CREATE DATABASE ${DB_NAME_ESCAPED} OWNER ${DB_USER_ESCAPED};
  END IF;
END
\$\$;
SQL

psql "postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}" -f "$SCHEMA_FILE"
