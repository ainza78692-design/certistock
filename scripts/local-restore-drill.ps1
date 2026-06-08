param(
  [string]$BackupPath,
  [string]$DrillDbName = "certistock_restore_drill",
  [string]$PostgresPassword = "certistock",
  [int]$DbPort = 5433
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$pgBin = Join-Path $root "tools\postgresql-17.9\pgsql\bin"
$backupRoot = Join-Path $root "data\backups"

if (-not $BackupPath) {
  $latest = Get-ChildItem $backupRoot -Directory |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) {
    throw "No backup directories found under $backupRoot"
  }
  $BackupPath = $latest.FullName
}

$dump = Join-Path $BackupPath "certistock.dump"
if (!(Test-Path $dump)) {
  throw "Backup dump not found: $dump"
}

foreach ($tool in @("dropdb.exe", "createdb.exe", "pg_restore.exe", "psql.exe")) {
  if (!(Test-Path (Join-Path $pgBin $tool))) {
    throw "PostgreSQL tool missing: $tool under $pgBin"
  }
}

$env:PGPASSWORD = $PostgresPassword

Write-Host "Dropping restore drill database if it exists..."
& (Join-Path $pgBin "dropdb.exe") -h 127.0.0.1 -p $DbPort -U postgres --if-exists $DrillDbName

Write-Host "Creating restore drill database..."
& (Join-Path $pgBin "createdb.exe") -h 127.0.0.1 -p $DbPort -U postgres -O certistock $DrillDbName

Write-Host "Restoring backup into $DrillDbName..."
& (Join-Path $pgBin "pg_restore.exe") -h 127.0.0.1 -p $DbPort -U postgres -d $DrillDbName $dump

Write-Host "Verifying restored tables..."
& (Join-Path $pgBin "psql.exe") -h 127.0.0.1 -p $DbPort -U postgres -d $DrillDbName -c "select count(*) as app_users from app_users;"
& (Join-Path $pgBin "psql.exe") -h 127.0.0.1 -p $DbPort -U postgres -d $DrillDbName -c "select count(*) as uploaded_files from uploaded_files;"

Write-Host "Restore drill completed successfully from $BackupPath" -ForegroundColor Green
