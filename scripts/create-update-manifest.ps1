param(
  [string]$Version,
  [string]$InstallerPath,
  [string]$OutputRoot = "release\updates",
  [string]$BaseUrl = "https://certistock.local/updates",
  [switch]$Mandatory,
  [string]$MinimumSupportedVersion,
  [string]$RollbackVersion = "",
  [string]$ReleaseNotes = ""
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $Version) {
  $package = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
  $Version = $package.version
}

if (-not $MinimumSupportedVersion) {
  $MinimumSupportedVersion = $Version
}

if (-not $InstallerPath) {
  $InstallerPath = Join-Path $root "release\CertiStock Setup $Version.exe"
}

if (!(Test-Path $InstallerPath)) {
  throw "Installer not found: $InstallerPath"
}

$output = Join-Path $root $OutputRoot
$installers = Join-Path $output "installers"
$notes = Join-Path $output "release-notes"
New-Item -ItemType Directory -Force -Path $installers, $notes | Out-Null

$installerName = Split-Path $InstallerPath -Leaf
$targetInstaller = Join-Path $installers $installerName
Copy-Item $InstallerPath $targetInstaller -Force

$sha = (Get-FileHash $targetInstaller -Algorithm SHA256).Hash.ToLowerInvariant()

if ($ReleaseNotes) {
  Set-Content -Path (Join-Path $notes "$Version.md") -Value $ReleaseNotes -Encoding UTF8
} elseif (!(Test-Path (Join-Path $notes "$Version.md"))) {
  Set-Content -Path (Join-Path $notes "$Version.md") -Value "CertiStock $Version release." -Encoding UTF8
}

$encodedInstallerName = [uri]::EscapeDataString($installerName)
$manifest = [ordered]@{
  app = "CertiStock"
  channel = "stable"
  latestVersion = $Version
  minimumSupportedVersion = $MinimumSupportedVersion
  mandatory = [bool]$Mandatory
  releaseDate = (Get-Date -Format "yyyy-MM-dd")
  installerUrl = "$BaseUrl/installers/$encodedInstallerName"
  sha256 = $sha
  signatureUrl = "$BaseUrl/signatures/$encodedInstallerName.sig"
  releaseNotesUrl = "$BaseUrl/release-notes/$Version.md"
  rollbackVersion = $RollbackVersion
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $output "version.json") -Encoding UTF8

Write-Host "Update package prepared at $output" -ForegroundColor Green
Write-Host "SHA-256: $sha"
