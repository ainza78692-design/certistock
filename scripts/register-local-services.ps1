param(
  [string]$NssmPath = "nssm.exe"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not (Get-Command $NssmPath -ErrorAction SilentlyContinue)) {
  throw "NSSM was not found. Download NSSM and pass -NssmPath C:\path\to\nssm.exe"
}

$node = (Get-Command node).Source
$python = Join-Path $root "ocr-worker\venv\Scripts\python.exe"

Write-Host "Registering CertiStockLocalApi service..."
& $NssmPath install CertiStockLocalApi $node (Join-Path $root "server\dist\index.js")
& $NssmPath set CertiStockLocalApi AppDirectory $root
& $NssmPath set CertiStockLocalApi Start SERVICE_AUTO_START
& $NssmPath set CertiStockLocalApi AppStdout (Join-Path $root "logs\local-api.log")
& $NssmPath set CertiStockLocalApi AppStderr (Join-Path $root "logs\local-api.err.log")

Write-Host "Registering CertiStockOcrWorker service..."
& $NssmPath install CertiStockOcrWorker $python "-m uvicorn app:app --host 0.0.0.0 --port 8001"
& $NssmPath set CertiStockOcrWorker AppDirectory (Join-Path $root "ocr-worker")
& $NssmPath set CertiStockOcrWorker Start SERVICE_AUTO_START
& $NssmPath set CertiStockOcrWorker AppStdout (Join-Path $root "logs\ocr-worker.log")
& $NssmPath set CertiStockOcrWorker AppStderr (Join-Path $root "logs\ocr-worker.err.log")

Write-Host "Services registered. Start them from Windows Services or run:" -ForegroundColor Green
Write-Host "  nssm start CertiStockLocalApi"
Write-Host "  nssm start CertiStockOcrWorker"
