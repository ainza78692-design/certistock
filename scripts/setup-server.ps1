param(
  [string]$DbUser = "certistock",
  [string]$DbPassword = "certistock",
  [string]$DbName = "certistock_utf8",
  [int]$DbPort = 5432,
  [string]$PostgresPassword = "certistock",
  [string]$TaskName = "CertiStock Local Stack",
  [switch]$SkipDependencyInstall,
  [switch]$InstallProductionOcr,
  [switch]$SkipAutoStart,
  [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script as Administrator. Right-click setup-server.ps1 and choose 'Run with PowerShell as Administrator'."
  }
}

function New-RandomSecret {
  $bytes = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  [Convert]::ToBase64String($bytes)
}

function Ensure-Path {
  param([string]$Path)
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

Assert-Admin

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PgBin = Join-Path $Root "tools\postgresql-17.9\pgsql\bin"
$PgData = Join-Path $Root "data\postgres"
$DataDir = Join-Path $Root "data"
$FilesDir = Join-Path $Root "data\files"
$BackupDir = Join-Path $Root "data\backups"
$LogDir = Join-Path $Root "data\logs"
$ServerEnv = Join-Path $Root "server\.env"
$SchemaFile = Join-Path $Root "server\sql\001_local_postgres_schema.sql"
$DatabaseUrl = "postgres://$DbUser`:$DbPassword@127.0.0.1:$DbPort/$DbName"

Write-Host "CertiStock server setup" -ForegroundColor Cyan
Write-Host "Root: $Root"

Ensure-Path $DataDir
Ensure-Path $FilesDir
Ensure-Path $BackupDir
Ensure-Path $LogDir

if (!(Test-Path (Join-Path $PgBin "initdb.exe")) -or !(Test-Path (Join-Path $PgBin "psql.exe"))) {
  throw "Portable PostgreSQL was not found at $PgBin. Put PostgreSQL ZIP binaries under tools\postgresql-17.9\pgsql before running setup."
}

if (!(Test-Path $PgData)) {
  Write-Host "Initializing portable PostgreSQL data directory..."
  $pwFile = Join-Path $DataDir "postgres-password.tmp"
  Set-Content -Path $pwFile -Value $PostgresPassword -Encoding ASCII
  try {
    & (Join-Path $PgBin "initdb.exe") -D $PgData -U postgres -A password --pwfile $pwFile --encoding=UTF8 --locale=C
  } finally {
    Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Starting PostgreSQL..."
& (Join-Path $PSScriptRoot "start-local-postgres.ps1") -Port $DbPort

$env:PGPASSWORD = $PostgresPassword
$createSql = @"
do `$`$
begin
  if not exists (select 1 from pg_roles where rolname = '$DbUser') then
    create role $DbUser login password '$DbPassword';
  end if;
end
`$`$;
select 'create database $DbName owner $DbUser encoding ''UTF8'' template template0 locale ''C'''
where not exists (select from pg_database where datname = '$DbName')\gexec
"@

Write-Host "Creating database/user if needed..."
$createSql | & (Join-Path $PgBin "psql.exe") -h 127.0.0.1 -p $DbPort -U postgres -d postgres

Write-Host "Applying database schema..."
& (Join-Path $PgBin "psql.exe") $DatabaseUrl -f $SchemaFile

if (!(Test-Path $ServerEnv)) {
  Write-Host "Creating server/.env..."
  $jwt = New-RandomSecret
  @"
DATABASE_URL=$DatabaseUrl
JWT_SECRET=$jwt
JWT_EXPIRES_IN=12h
LOCAL_API_HOST=0.0.0.0
LOCAL_API_PORT=8787
FILE_STORAGE_ROOT=./data/files
OCR_WORKER_URL=http://127.0.0.1:8001
MASS_BALANCE_WORKER_URL=http://127.0.0.1:8001
OCR_WORKER_API_KEY=
LOG_LEVEL=info
"@ | Set-Content -Path $ServerEnv -Encoding UTF8
}

if (-not $SkipDependencyInstall) {
  Write-Host "Installing Node dependencies..."
  & npm.cmd install --prefix $Root

  Write-Host "Installing OCR/XLSX worker dependencies..."
  $python = Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) {
    throw "Python was not found. Install Python 3.10, then rerun this setup."
  }
  Push-Location (Join-Path $Root "ocr-worker")
  try {
    if (!(Test-Path "venv")) {
      & python -m venv venv
    }
    & ".\venv\Scripts\python.exe" -m pip install --upgrade pip
    & ".\venv\Scripts\python.exe" -m pip install -r requirements.txt
    if ($InstallProductionOcr) {
      & ".\venv\Scripts\python.exe" -m pip install -r requirements-paddleocr.txt
    } else {
      Write-Warning "PaddleOCR production dependencies were not installed. Rerun setup with -InstallProductionOcr before client go-live."
    }
  } finally {
    Pop-Location
  }
}

Write-Host "Building CertiStock local API and frontend..."
& npm.cmd run server:build --prefix $Root
& npm.cmd run build --prefix $Root

if (-not $SkipFirewall) {
  Write-Host "Configuring Windows Firewall..."
  foreach ($rule in @(
    @{ Name = "CertiStock Local API"; Port = 8787 },
    @{ Name = "CertiStock OCR XLSX Worker"; Port = 8001 }
  )) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if (-not $existing) {
      New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $rule.Port | Out-Null
    }
  }
}

if (-not $SkipAutoStart) {
  Write-Host "Registering auto-start scheduled task..."
  $startScript = Join-Path $PSScriptRoot "start-local-stack.ps1"
  $action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

  Write-Host "Registering daily backup scheduled task..."
  $backupScript = Join-Path $PSScriptRoot "local-backup.ps1"
  $backupAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
  $backupTrigger = New-ScheduledTaskTrigger -Daily -At 19:30
  Register-ScheduledTask -TaskName "CertiStock Daily Backup" -Action $backupAction -Trigger $backupTrigger -Principal $principal -Settings $settings -Force | Out-Null
}

Write-Host "Starting CertiStock stack..."
& (Join-Path $PSScriptRoot "start-local-stack.ps1") -RestartApi -RestartOcr

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Server health: http://127.0.0.1:8787/health"
Write-Host "LAN users should connect the .exe to: http://<SERVER-LAN-IP>:8787"
