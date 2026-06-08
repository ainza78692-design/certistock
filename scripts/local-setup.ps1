param(
  [string]$DatabaseUrl = "postgres://certistock:certistock@127.0.0.1:5432/certistock_utf8",
  [string]$PostgresAdmin = "postgres",
  [string]$PostgresPassword = "",
  [string]$DbUser = "certistock",
  [string]$DbPassword = "certistock",
  [string]$DbName = "certistock_utf8"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "CertiStock local setup" -ForegroundColor Cyan
Write-Host "Project root: $root"

$bundledPsql = Join-Path $root "tools\postgresql-17.9\pgsql\bin\psql.exe"
$psqlCommand = Get-Command psql -ErrorAction SilentlyContinue
if (Test-Path $bundledPsql) {
  $psql = $bundledPsql
} elseif ($psqlCommand) {
  $psql = $psqlCommand.Source
} else {
  throw "psql was not found. Install PostgreSQL or place the portable PostgreSQL binaries under tools\postgresql-17.9."
}

if ($PostgresPassword) {
  $env:PGPASSWORD = $PostgresPassword
}

Write-Host "Creating PostgreSQL user/database if needed..."
$sql = @"
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

$sql | & $psql -U $PostgresAdmin -d postgres

Write-Host "Applying CertiStock schema..."
& $psql $DatabaseUrl -f "server/sql/001_local_postgres_schema.sql"

if (-not (Test-Path "server/.env")) {
  $jwt = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
  @"
DATABASE_URL=$DatabaseUrl
JWT_SECRET=$jwt
JWT_EXPIRES_IN=12h
LOCAL_API_HOST=0.0.0.0
LOCAL_API_PORT=8787
FILE_STORAGE_ROOT=./data/files
OCR_WORKER_URL=http://127.0.0.1:8001
OCR_WORKER_API_KEY=
LOG_LEVEL=info
"@ | Set-Content -Path "server/.env" -Encoding UTF8
  Write-Host "Created server/.env"
}

Write-Host "Installing Node dependencies..."
npm install

Write-Host "Installing OCR worker Python dependencies..."
Push-Location "ocr-worker"
if (-not (Test-Path "venv")) {
  python -m venv venv
}
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Pop-Location

Write-Host "Building frontend and local API..."
npm run server:build
npm run build

Write-Host "Done. Start services manually for test:" -ForegroundColor Green
Write-Host "  npm run server:dev"
Write-Host "  cd ocr-worker; .\venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8001"
