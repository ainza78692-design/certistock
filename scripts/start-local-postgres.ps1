param(
  [int]$Port = 5432
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$PgBin = Join-Path $Root "tools\postgresql-17.9\pgsql\bin"
$DataDir = Join-Path $Root "data\postgres"
$LogDir = Join-Path $Root "data\logs"
$LogFile = Join-Path $LogDir "postgres.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-PortListening {
  param([int]$Port)
  $matches = netstat -ano | Select-String ":$Port\s+.*LISTENING"
  return [bool]$matches
}

if (!(Test-Path (Join-Path $PgBin "pg_ctl.exe"))) {
  throw "PostgreSQL binaries not found at $PgBin"
}

if (!(Test-Path $DataDir)) {
  throw "PostgreSQL data directory not found at $DataDir"
}

$pgListening = Test-PortListening -Port $Port
if ($pgListening) {
  Write-Host "PostgreSQL is already listening on 127.0.0.1:$Port."
  exit 0
}

& (Join-Path $PgBin "pg_ctl.exe") -D $DataDir status *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "PostgreSQL is already running."
  exit 0
}

& (Join-Path $PgBin "pg_ctl.exe") -D $DataDir -l $LogFile -o "-p $Port" start
Write-Host "PostgreSQL started on 127.0.0.1:$Port"
