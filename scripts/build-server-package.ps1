param(
  [string]$OutputRoot = "client-package",
  [switch]$IncludeNodeModules,
  [switch]$IncludeOcrVenv,
  [switch]$IncludePostgresBinaries,
  [switch]$IncludeDesktopInstaller,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Target = Join-Path $Root $OutputRoot
$ServerTarget = Join-Path $Target "CertiStock-Server"
$ClientTarget = Join-Path $Target "CertiStock-Client"
$ZipPath = Join-Path $Root "CertiStock-Office-Package.zip"

function Invoke-Native {
  param(
    [string]$Name,
    [scriptblock]$Command
  )
  Write-Host $Name
  Push-Location $Root
  try {
    & $Command
  } finally {
    Pop-Location
  }
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Copy-Dir {
  param(
    [string]$From,
    [string]$To,
    [string[]]$Exclude = @()
  )
  if (Test-Path $From) {
    New-Item -ItemType Directory -Force -Path $To | Out-Null
    Copy-Item -Path (Join-Path $From "*") -Destination $To -Recurse -Force -Exclude $Exclude
  }
}

function Copy-PostgresRuntime {
  param(
    [string]$From,
    [string]$To
  )

  if (!(Test-Path $From)) {
    throw "Portable PostgreSQL folder not found at $From"
  }

  New-Item -ItemType Directory -Force -Path $To | Out-Null
  foreach ($folder in @("bin", "lib", "share", "include")) {
    $source = Join-Path $From $folder
    if (Test-Path $source) {
      Copy-Dir $source (Join-Path $To $folder)
    }
  }
}

if (Test-Path $Target) {
  Remove-Item $Target -Recurse -Force
}
if (Test-Path $ZipPath) {
  Remove-Item $ZipPath -Force
}

New-Item -ItemType Directory -Force -Path $ServerTarget | Out-Null
New-Item -ItemType Directory -Force -Path $ClientTarget | Out-Null

if (-not $SkipBuild) {
  Invoke-Native "Building local API..." { & npm.cmd run server:build }
  Invoke-Native "Building frontend..." { & npm.cmd run build }
} else {
  Write-Host "Skipping build; using existing server/dist and dist outputs..."
}

Write-Host "Copying server package files..."
Copy-Dir (Join-Path $Root "server") (Join-Path $ServerTarget "server") @(".env")
Copy-Dir (Join-Path $Root "scripts") (Join-Path $ServerTarget "scripts")
Copy-Dir (Join-Path $Root "ocr-worker") (Join-Path $ServerTarget "ocr-worker") @("venv", "__pycache__")
Copy-Dir (Join-Path $Root "docs") (Join-Path $ServerTarget "docs")
Copy-Dir (Join-Path $Root "public") (Join-Path $ServerTarget "public")
Copy-Dir (Join-Path $Root "dist") (Join-Path $ServerTarget "dist")
Copy-Dir (Join-Path $Root "src") (Join-Path $ServerTarget "src")
Copy-Item (Join-Path $Root "package.json") $ServerTarget -Force
Copy-Item (Join-Path $Root "package-lock.json") $ServerTarget -Force
Copy-Item (Join-Path $Root ".env.example") $ServerTarget -Force
foreach ($file in @(
  "index.html",
  "components.json",
  "vite.config.ts",
  "vitest.config.ts",
  "tailwind.config.ts",
  "postcss.config.js",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json"
)) {
  $source = Join-Path $Root $file
  if (Test-Path $source) {
    Copy-Item $source $ServerTarget -Force
  }
}

New-Item -ItemType Directory -Force -Path (Join-Path $ServerTarget "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ServerTarget "data\files") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ServerTarget "data\backups") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ServerTarget "data\logs") | Out-Null

if ($IncludeNodeModules) {
  Write-Host "Including node_modules..."
  Copy-Dir (Join-Path $Root "node_modules") (Join-Path $ServerTarget "node_modules")
}

if ($IncludeOcrVenv) {
  Write-Host "Including OCR worker venv..."
  Copy-Dir (Join-Path $Root "ocr-worker\venv") (Join-Path $ServerTarget "ocr-worker\venv")
}

if ($IncludePostgresBinaries) {
  Write-Host "Including portable PostgreSQL runtime..."
  Copy-PostgresRuntime `
    (Join-Path $Root "tools\postgresql-17.9\pgsql") `
    (Join-Path $ServerTarget "tools\postgresql-17.9\pgsql")
}

if ($IncludeDesktopInstaller) {
  if (-not $SkipBuild) {
    Invoke-Native "Building desktop installer..." { & npm.cmd run desktop:build }
  } else {
    Write-Host "Skipping desktop build; using existing installer..."
  }
  $installer = Join-Path $Root "release\CertiStock Setup.exe"
  if (Test-Path $installer) {
    Copy-Item $installer $ClientTarget -Force
  } else {
    throw "Desktop installer not found at $installer"
  }
}

@"
# CertiStock Client Install

1. Install `CertiStock Setup.exe`.
2. Open CertiStock.
3. On sign-in, set server URL to `http://SERVER-IP:8787`.
4. Login or create account.
"@ | Set-Content -Path (Join-Path $ClientTarget "README.txt") -Encoding UTF8

@"
# CertiStock Server Install

Run PowerShell as Administrator:

cd "$ServerTarget"
.\scripts\setup-server.ps1

After setup:
- Server health: http://127.0.0.1:8787/health
- Other PCs use: http://SERVER-IP:8787
"@ | Set-Content -Path (Join-Path $ServerTarget "README.txt") -Encoding UTF8

Write-Host "Creating ZIP package..."
Compress-Archive -Path (Join-Path $Target "*") -DestinationPath $ZipPath -Force

Write-Host "Package created at $Target" -ForegroundColor Green
Write-Host "ZIP created at $ZipPath" -ForegroundColor Green
