param(
  [switch]$RestartApi,
  [switch]$RestartOcr
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $Root "data"
$ServerEnv = Join-Path $Root "server\.env"
$ApiLog = Join-Path $DataDir "local-api.log"
$OcrOutLog = Join-Path $DataDir "ocr-worker.out.log"
$OcrErrLog = Join-Path $DataDir "ocr-worker.err.log"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$DbPort = 5432
if (Test-Path $ServerEnv) {
  $databaseUrlLine = Get-Content $ServerEnv | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if ($databaseUrlLine -match '127\.0\.0\.1:(\d+)/') {
    $DbPort = [int]$Matches[1]
  }
}

& (Join-Path $PSScriptRoot "start-local-postgres.ps1") -Port $DbPort

$apiListening = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if ($apiListening -and $RestartApi) {
  $apiListening | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    Write-Host "Stopping existing CertiStock local API process $_ on port 8787."
    Stop-Process -Id $_ -Force
  }
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    $stillListening = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
    if (!$stillListening) { break }
  }
  $apiListening = $null
}

if ($apiListening) {
  $pids = ($apiListening | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
  Write-Host "CertiStock local API is already running on port 8787. PID(s): $pids"
} else {
  Remove-Item $ApiLog -ErrorAction SilentlyContinue
  $ApiErrLog = Join-Path $DataDir "local-api.err.log"
  Remove-Item $ApiErrLog -ErrorAction SilentlyContinue
  Write-Host "Building CertiStock local API..."
  & npm.cmd run server:build --prefix $Root
  $Node = (Get-Command node -ErrorAction Stop).Source
  $ApiEntry = Join-Path $Root "server\dist\index.js"
  Start-Process -FilePath $Node `
    -ArgumentList @("`"$ApiEntry`"") `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ApiLog `
    -RedirectStandardError $ApiErrLog
  Write-Host "Started CertiStock local API on port 8787."
}

$ocrListening = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue
if ($ocrListening -and $RestartOcr) {
  $ocrListening | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    Write-Host "Stopping existing OCR/XLSX worker process $_ on port 8001."
    Stop-Process -Id $_ -Force
  }
  Start-Sleep -Seconds 1
  $ocrListening = $null
}

if ($ocrListening) {
  $pids = ($ocrListening | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
  Write-Host "OCR/XLSX worker is already running on port 8001. PID(s): $pids"
} else {
  $python = Join-Path $Root "ocr-worker\venv\Scripts\python.exe"
  if (!(Test-Path $python)) {
    throw "OCR worker venv not found. Run: python -m venv ocr-worker\venv; .\ocr-worker\venv\Scripts\python.exe -m pip install -r ocr-worker\requirements.txt"
  }

  Start-Process -FilePath $python `
    -ArgumentList @("-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001") `
    -WorkingDirectory (Join-Path $Root "ocr-worker") `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OcrOutLog `
    -RedirectStandardError $OcrErrLog
  Write-Host "Started OCR/XLSX worker on port 8001."
}

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $apiReady = $false
  try {
    $apiReady = (Invoke-WebRequest "http://127.0.0.1:8787/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200
  } catch {
    $apiReady = $false
  }
  if ($apiReady) { break }
}

Write-Host ""
Write-Host "Health checks:"
try {
  Invoke-WebRequest "http://127.0.0.1:8787/health" -UseBasicParsing | Select-Object StatusCode,Content
} catch {
  Write-Warning "Local API did not respond on http://127.0.0.1:8787/health. Check $ApiLog and $ApiErrLog."
}
try {
  Invoke-WebRequest "http://127.0.0.1:8001/health" -UseBasicParsing | Select-Object StatusCode,Content
} catch {
  Write-Warning "OCR/XLSX worker did not respond on http://127.0.0.1:8001/health. Check $OcrOutLog and $OcrErrLog."
}
