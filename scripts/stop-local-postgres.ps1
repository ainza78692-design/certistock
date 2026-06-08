$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$PgBin = Join-Path $Root "tools\postgresql-17.9\pgsql\bin"
$DataDir = Join-Path $Root "data\postgres"

if (!(Test-Path (Join-Path $PgBin "pg_ctl.exe"))) {
  throw "PostgreSQL binaries not found at $PgBin"
}

& (Join-Path $PgBin "pg_ctl.exe") -D $DataDir status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "PostgreSQL is not running."
  exit 0
}

& (Join-Path $PgBin "pg_ctl.exe") -D $DataDir stop -m fast
Write-Host "PostgreSQL stopped."
