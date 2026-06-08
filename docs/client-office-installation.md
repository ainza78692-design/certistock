# CertiStock Office Installation Guide

This guide is for installing CertiStock on one office server PC and allowing 4-5 users on the same LAN/Wi-Fi to use the desktop `.exe`.

## Recommended Setup

Use native Windows services, not Docker, for the first client deployment.

```text
Server PC
-> PostgreSQL
-> CertiStock local API on port 8787
-> OCR/XLSX worker on port 8001
-> local files and backups

User PCs
-> CertiStock desktop app
-> connects to http://SERVER-IP:8787
```

Docker is optional later, but it adds Docker Desktop, WSL2, more disk usage, and more startup failure points.

## Server PC Setup

1. Copy the `CertiStock-Server` folder to the server PC.

2. Right-click PowerShell and choose **Run as Administrator**.

3. Run:

```powershell
cd "C:\path\to\CertiStock-Server"
.\scripts\setup-server.ps1
```

For production scanned-PDF OCR, run:

```powershell
.\scripts\setup-server.ps1 -InstallProductionOcr
```

The setup script will:

- initialize local PostgreSQL if needed
- create the CertiStock database
- apply schema
- install Node dependencies
- create OCR Python environment
- install PaddleOCR worker requirements
- build the local API and frontend
- open Windows Firewall ports `8787` and `8001`
- register startup task for the full local stack
- register daily backup task
- start everything

## Health Checks

On the server PC:

```text
http://127.0.0.1:8787/health
http://127.0.0.1:8001/health
```

The OCR health response must show `paddleocrAvailable: true` and `pdfRenderingAvailable: true` before client go-live for scanned PDFs.

From another PC on the same Wi-Fi:

```text
http://SERVER-IP:8787/health
```

Example:

```text
http://10.43.139.233:8787/health
```

If the other PC cannot open the health URL, check:

- server PC is on
- both PCs are on the same network
- Windows Firewall allowed port `8787`
- server IP is correct

## Client PC Setup

1. Install `CertiStock Setup.exe`.
2. Open CertiStock.
3. On the sign-in page, set local server URL:

```text
http://SERVER-IP:8787
```

4. Test connection.
5. Login or create account.

## IP Address Recommendation

Reserve a static DHCP IP for the server PC in the Wi-Fi router.

Without this, the server IP can change after reboot or router restart. If it changes, each desktop app user must update the server URL from sign-in/settings.

## Startup Behavior

After setup, the server PC should automatically start:

- PostgreSQL
- CertiStock local API
- OCR/XLSX worker

Users can only use the app while the server PC is powered on and connected to the LAN.

## Backup

The setup registers a daily backup task at `7:30 PM`.

Backups include:

- PostgreSQL database dump
- uploaded PDF files
- generated Mass Balance XLSX files

Default location:

```text
data/backups
```

Recommended: copy this folder to external drive or cloud sync regularly.

## Manual Commands

Start stack manually:

```powershell
.\scripts\start-local-stack.ps1
```

Restart API/OCR:

```powershell
.\scripts\start-local-stack.ps1 -RestartApi -RestartOcr
```

Create backup now:

```powershell
.\scripts\local-backup.ps1
```

Run a restore drill against the latest backup:

```powershell
.\scripts\local-restore-drill.ps1
```

Build a handoff package:

```powershell
.\scripts\build-server-package.ps1 -IncludePostgresBinaries -IncludeDesktopInstaller
```
