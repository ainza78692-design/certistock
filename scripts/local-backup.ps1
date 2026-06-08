param(
  [string]$DatabaseUrl = "postgres://certistock:certistock@127.0.0.1:5432/certistock_utf8",
  [int]$Keep = 30
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$serverEnv = Join-Path $root "server\.env"
$backupRoot = Join-Path $root "data/backups"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$target = Join-Path $backupRoot $stamp

New-Item -ItemType Directory -Force -Path $target | Out-Null

if (Test-Path $serverEnv) {
  $databaseUrlLine = Get-Content $serverEnv | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if ($databaseUrlLine) {
    $DatabaseUrl = $databaseUrlLine.Substring("DATABASE_URL=".Length)
  }
}

$bundledPgDump = Join-Path $root "tools\postgresql-17.9\pgsql\bin\pg_dump.exe"
$pgDumpCommand = Get-Command pg_dump -ErrorAction SilentlyContinue
if (Test-Path $bundledPgDump) {
  $pgDump = $bundledPgDump
} elseif ($pgDumpCommand) {
  $pgDump = $pgDumpCommand.Source
} else {
  throw "pg_dump was not found. Install PostgreSQL or place the portable PostgreSQL binaries under tools\postgresql-17.9."
}

Write-Host "Creating database backup..."
& $pgDump $DatabaseUrl -Fc -f (Join-Path $target "certistock.dump")

Write-Host "Copying uploaded files..."
$files = Join-Path $root "data/files"
if (Test-Path $files) {
  Copy-Item $files -Destination (Join-Path $target "files") -Recurse -Force
}

Get-ChildItem $backupRoot -Directory |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep |
  Remove-Item -Recurse -Force

Write-Host "Backup written to $target" -ForegroundColor Green
