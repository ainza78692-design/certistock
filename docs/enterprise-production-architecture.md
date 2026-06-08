# CertiStock Enterprise Production Architecture

Date: 2026-05-27

This runbook is tailored to the current CertiStock codebase in this repository. It is not a generic deployment plan.

## 1. Codebase Analysis

### Detected Architecture

- Frontend: Vite + React 18 + TypeScript.
- UI stack: Tailwind CSS, Radix UI style components, TanStack Query, React Router, Lucide icons, Recharts.
- Desktop app: Electron 42 packaged by `electron-builder` as a Windows NSIS installer.
- Backend: Node.js TypeScript API using Fastify 5.
- API port: `8787`.
- API health route: `GET /health`.
- Database: PostgreSQL via `pg` pool.
- Default local DB: `certistock_utf8`.
- Default local DB URL: `postgres://certistock:certistock@127.0.0.1:5432/certistock_utf8`.
- Auth: local JWT auth in `server/src/auth.ts`, bcrypt password hashing, token issuer `certistock-local`.
- Legacy/cloud mode: Supabase client remains in the frontend for cloud mode and transitional compatibility.
- Local mode switch: `VITE_BACKEND_MODE=local`.
- Local server URL storage: browser/Electron `localStorage` key `certistock.local.apiUrl`.
- File storage: local filesystem rooted at `FILE_STORAGE_ROOT`, defaulting to `data/files`.
- File buckets: `tc-pdfs` and `mass-balance-xlsx`.
- OCR/document path: native PDF text extraction with `unpdf`; weak text falls back to HTTP OCR worker at `OCR_WORKER_URL`, default `http://127.0.0.1:8001`.
- Mass balance XLSX: backend calls the same worker at `/mass-balance/render`.
- Existing Windows deployment: PowerShell scripts configure portable PostgreSQL, Node API, daily backup, firewall rules, and startup scheduled task.
- Existing Linux deployment: not present before this runbook; added under `ops/`.

### Important Current Files

- `package.json`: scripts, app version, and Electron Builder NSIS config.
- `server/src/index.ts`: Fastify API startup.
- `server/src/config.ts`: environment and runtime defaults.
- `server/sql/001_local_postgres_schema.sql`: local PostgreSQL schema.
- `server/src/routes/*`: local API modules.
- `server/src/storage.ts`: local filesystem storage safety.
- `electron/main.cjs`: desktop shell.
- `src/lib/backendMode.ts`: local/cloud mode and server URL handling.
- `scripts/setup-server.ps1`: current Windows server setup.
- `scripts/local-backup.ps1`: current simple Windows backup.
- `docs/local-postgres-migration.md`: migration status and remaining work.

### Current API Surface

The local API includes:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/uploads`
- `POST /api/uploads/tc-pdfs`
- `GET /api/uploads/:id`
- `GET /api/uploads/:id/file`
- `POST /api/uploads/:id/extract`
- `POST /api/uploads/:id/approve`
- `DELETE /api/uploads/:id`
- `GET /api/certificates`
- `DELETE /api/certificates/:id`
- `GET /api/stock-lots`
- `GET /api/stock-lots/:id`
- `DELETE /api/stock-lots/:id`
- `GET /api/stock-lots/:id/entries`
- `GET /api/stock-lots/:id/ledger`
- `GET /api/stock-lots/:id/mass-balance`
- `POST /api/stock-lots/:id/mass-balance`
- `GET /api/stock-lots/:id/mass-balance/download`
- `GET /api/consumption`
- `POST /api/consumption`
- `DELETE /api/consumption/:id`
- `GET /api/incoming-stock`
- `POST /api/incoming-stock`
- `PUT /api/incoming-stock/:id`
- `DELETE /api/incoming-stock/:id`
- `GET /api/outward-sales`
- product, entity, and search routes.

### Database Model

The local schema contains these core tables:

- `app_users`
- `companies`
- `profiles`
- `user_roles`
- `suppliers`
- `customers`
- `certification_bodies`
- `uploaded_files`
- `extraction_jobs`
- `extraction_model_runs`
- `transaction_certificates`
- `shipments`
- `product_master`
- `product_aliases`
- `product_lots`
- `outward_sales`
- `incoming_stock`
- `consumption_entries`
- `stock_ledger`
- `mass_balance_workbooks`
- `audit_logs`

The schema already has useful indexes for company isolation, stock lots, dates, invoices, uploaded files, ledger, and mass-balance lookups. The production gap is migration lifecycle: only `001_local_postgres_schema.sql` exists; there is no ordered migration runner yet.

### Deployment Blockers And Risks

- `ocr-worker` is now present with `/health`, `/ocr`, and `/mass-balance/render`.
- Production scanned-PDF OCR still requires installing `ocr-worker/requirements-paddleocr.txt`; `/health` must report `paddleocrAvailable: true` and `pdfRenderingAvailable: true`.
- Desktop versioning is now semantic at `1.0.0`.
- Electron update checking is implemented through the office-server `version.json` manifest, SHA-256 installer verification, and a React update prompt.
- Windows scripts use default DB credentials unless changed at setup. Production must use generated passwords.
- Fastify CORS is `origin: true`, acceptable on LAN during transition but too permissive for hardened production.
- Local API binds to `0.0.0.0` by default. Behind Nginx on Linux it should bind to `127.0.0.1`; on Windows LAN mode it may remain `0.0.0.0`.
- No centralized audit logging is wired in the API despite `audit_logs` table existing.
- Backup script is full-copy only on Windows and has no restore verification beyond `pg_dump` success.
- No current CI/CD workflow was present. Added `.github/workflows/deploy-production.yml`.
- No Linux service files were present. Added `ops/systemd`.
- No backup retention automation was present. Added `ops/linux/certistock-retention.sh`.

## 2. Recommended Production Architecture

### Phase 1 Target

Use a single hardened client-office server:

- Ubuntu Server 24.04 LTS.
- PostgreSQL installed natively from Ubuntu/PostgreSQL packages.
- Node.js 22 LTS.
- Nginx reverse proxy.
- CertiStock API as a systemd service.
- OCR/XLSX worker as a systemd service once the missing worker is restored.
- Tailscale for VPN-only remote maintenance.
- GitHub Actions self-hosted runner on the server.
- Local filesystem document storage under `/srv/certistock/data/files`.
- Backups under `/backups/certistock`.
- Cold archive under `/archive/certistock`.

### Why Ubuntu Instead Of Current Windows Script

The current Windows path works for first client pilots, but Ubuntu is better for production because systemd, PostgreSQL package maintenance, Nginx, log rotation, backups, SSH/VPN administration, and GitHub runner services are cleaner and more predictable. Keep Windows deployment scripts for emergency/small-office installs; use Ubuntu for the production standard.

### LAN Architecture

```text
Client PCs
  CertiStock.exe
  localStorage server URL: https://certistock.local
  connects over LAN/Wi-Fi

Client Server
  Nginx :443 on LAN
  CertiStock API :8787 on localhost
  PostgreSQL :5432 on localhost
  OCR/XLSX worker :8001 on localhost
  Tailscale admin VPN
  GitHub runner
  backup timers
```

### Production Folder Layout

```text
/opt/certistock/
  repo/
  releases/
  current -> /opt/certistock/releases/YYYYMMDD_HHMMSS
  logs/
  .env

/srv/certistock/
  data/
    files/
      tc-pdfs/
      mass-balance-xlsx/
  updates/
    version.json
    installers/
    signatures/
    checksums/
    release-notes/

/backups/certistock/
  daily/
  weekly/
  monthly/
  predeploy/
  logs/

/archive/certistock/
  YYYY/

/rollback/certistock/
```

## 3. Server Implementation

### Ubuntu Setup

Install packages:

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-client nodejs npm curl jq zstd fail2ban ufw git
```

Create users and folders:

```bash
sudo adduser --system --group --home /opt/certistock certistock
sudo mkdir -p /opt/certistock/{repo,releases,logs} /srv/certistock/{data/files,updates} /backups/certistock/{daily,weekly,monthly,predeploy,logs} /archive/certistock
sudo chown -R certistock:certistock /opt/certistock /srv/certistock
```

Copy:

- `ops/systemd/*.service` and `*.timer` to `/etc/systemd/system/`.
- `ops/nginx/certistock.conf` to `/etc/nginx/sites-available/certistock.conf`.
- `ops/linux/*.sh` to `/usr/local/bin/`.
- `ops/linux/certistock.env.example` to `/opt/certistock/.env`, then fill secrets.

Make scripts executable:

```bash
sudo chmod +x /usr/local/bin/certistock-*.sh /usr/local/bin/deploy-certistock.sh /usr/local/bin/rollback-certistock.sh
```

Enable services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now certistock-api.service
sudo systemctl enable --now certistock-backup-daily.timer certistock-backup-weekly.timer certistock-retention.timer
```

Enable OCR only after `ocr-worker` exists:

```bash
sudo systemctl enable --now certistock-ocr.service
```

## 4. Secure Remote Access

### Tailscale

Install:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh --advertise-tags=tag:client-server
```

Use `ops/tailscale/acl-example.json` as the starting ACL.

Admin rules:

- Developers connect through Tailscale only.
- PostgreSQL is never exposed outside localhost.
- Use SSH tunnel for DB maintenance:

```bash
ssh deploy@client-server
psql "$DATABASE_URL"
```

### Firewall

For Ubuntu:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.1.0/24 to any port 443 proto tcp
sudo ufw allow in on tailscale0
sudo ufw enable
```

Do not open:

- `5432`
- `8787`
- `8001`
- public `22`

## 5. GitHub CI/CD

Added workflow:

```text
.github/workflows/deploy-production.yml
```

The production job runs on:

```text
self-hosted, linux, certistock-prod
```

The runner calls:

```bash
sudo REPO_ROOT="$GITHUB_WORKSPACE" /usr/local/bin/deploy-certistock.sh
```

Deployment script behavior:

1. run predeploy backup
2. `npm ci`
3. `npm run test`
4. `npm run server:build`
5. `VITE_BACKEND_MODE=local npm run build`
6. create timestamped release
7. update `/opt/certistock/current`
8. restart `certistock-api.service`
9. health check
10. log to `/opt/certistock/logs/deploy-*.log`

Branch protection:

- protect `main`
- require PR review
- require tests
- require production environment approval
- restrict workflow dispatch to maintainers

Migration safety:

- do not run `001_local_postgres_schema.sql` blindly forever
- introduce `server/sql/migrations/NNN_description.sql`
- add a `schema_migrations` table
- migrations must be additive by default
- destructive migrations require backup and maintenance window

## 6. Desktop EXE Auto-Update

### Current State

The app is Electron Builder NSIS with a custom manifest-based updater. The current installer is versioned:

```text
release/CertiStock Setup 1.0.0.exe
```

`package.json` has:

```json
"version": "1.0.0",
"signAndEditExecutable": false
```

### Required Changes

Phase 1:

- code-sign installer and executable
- publish installer to `/srv/certistock/updates/installers/`
- publish manifest as `/srv/certistock/updates/version.json`
- use `scripts/create-update-manifest.ps1` to generate the manifest with the real SHA-256
- app checks `https://certistock.local/updates/version.json`
- app shows “New update available”
- mandatory updates are enforced by blocking dialog dismissal
- downloaded installers are SHA-256 verified before launch

Phase 2:

- add `electron-updater`
- configure Electron Builder `publish`
- support NSIS differential updates

### Manifest Contract

```json
{
  "latestVersion": "1.0.0",
  "minimumSupportedVersion": "1.0.0",
  "mandatory": false,
  "installerUrl": "https://certistock.local/updates/installers/CertiStock-Setup-1.0.0.exe",
  "sha256": "CHANGE_ME",
  "releaseNotesUrl": "https://certistock.local/updates/release-notes/1.0.0.md"
}
```

Desktop update flow:

1. app starts
2. read local app version
3. request `https://certistock.local/updates/version.json`
4. compare semantic version
5. show “New update available”
6. download installer
7. verify SHA-256 and publisher signature
8. run installer through Electron main process
9. restart app
10. preserve server URL in current `localStorage`; future hardening can add `%ProgramData%\CertiStock\config.json`

## 7. Backup And Retention

### Implemented Ops Scripts

- `ops/linux/certistock-backup.sh`
- `ops/linux/certistock-retention.sh`
- `ops/linux/certistock-restore-drill.sh`
- `ops/linux/archive-certistock-year.sql`
- systemd backup and retention timers under `ops/systemd`

### Retention Policy

- live operational DB records: keep online unless legal/client policy says otherwise
- file payloads older than 395 days: move to compressed cold archive
- daily backups: 35 days
- weekly backups: 14 weeks
- monthly backups: 24 months
- yearly archive: 7 years or client compliance period
- predeploy backups: 90 days
- backup logs: 2 years

### Why Archive Instead Of Delete

Transaction certificates, stock ledger entries, consumption entries, and mass-balance workbooks are audit records. They should not be automatically hard-deleted after one year. The safe policy is:

- keep metadata searchable
- move old heavy file payloads to `/archive/certistock`
- compress and checksum archives
- delete only after written retention approval

### Restore Drill

Run monthly:

```bash
sudo -u postgres /usr/local/bin/certistock-restore-drill.sh /backups/certistock/monthly/YYYYMMDD_HHMMSS
```

## 8. Database Management

Production PostgreSQL:

- bind to localhost only
- app role: `certistock_app`
- migration role: `certistock_migrator`
- backup role: `certistock_backup`
- readonly role: `certistock_readonly`

Recommended next DB implementation:

- create `schema_migrations`
- split `001_local_postgres_schema.sql` into migrations
- add audit log writes for auth, create, update, delete, upload, extraction, approve, consumption, and rollback
- add slow-query logging at 500-1000 ms
- add monthly `VACUUM ANALYZE`
- consider PITR/WAL archiving in Phase 2

## 9. Security Hardening

Required:

- SSH key auth only
- no root SSH
- Tailscale-only admin access
- UFW deny by default
- PostgreSQL localhost only
- Nginx TLS on LAN
- strong `JWT_SECRET`
- `.env` permissions `600`
- fail2ban enabled
- code-signed installer
- checksum update packages
- least privilege GitHub runner sudo rule only for deploy script

Recommended sudoers entry:

```text
github-runner ALL=(root) NOPASSWD: /usr/local/bin/deploy-certistock.sh
```

## 10. Monitoring And Maintenance

Phase 1:

- `systemctl status certistock-api`
- `journalctl -u certistock-api -f`
- `curl http://127.0.0.1:8787/health`
- Nginx logs in `/var/log/nginx`
- backup logs in `/backups/certistock/logs`
- disk alerts for `/`, `/srv`, `/backups`, `/archive`

Phase 2:

- Uptime Kuma for `/health`
- Netdata or Prometheus node exporter
- PostgreSQL exporter
- alert email/Slack/WhatsApp
- immutable offsite backups
- PITR monitoring

## 11. Phase Plan

### Phase 1 Essentials

- restore/add missing `ocr-worker`
- install `ocr-worker/requirements-paddleocr.txt` on production
- deploy Ubuntu server
- configure PostgreSQL roles and schema
- configure `/opt/certistock/.env`
- install systemd services
- configure Nginx TLS
- configure Tailscale and UFW
- install GitHub runner
- enable backup timers
- publish signed installer manually
- publish update manifest manually
- run restore drill

### Phase 2 Improvements

- implement Electron auto-update using `electron-updater`
- add ordered migration runner
- add audit logging middleware
- add PITR/WAL archive
- add immutable offsite backup
- add monitoring dashboard and alerts
- lock CORS to known origins
- add `%ProgramData%\CertiStock\config.json` for server URL persistence outside browser localStorage
- separate OCR worker deployment package with model cache and health checks

## 12. Production Checklists

### Deployment

- tests pass
- predeploy backup succeeds
- migrations reviewed
- release created
- service restarted
- `/health` returns ok
- sample login works
- PDF upload works
- OCR worker health works
- mass-balance XLSX generation works

### Rollback

- run `rollback-certistock.sh previous`
- verify `/health`
- verify backend `/health` embeds `ocrWorker.ok: true`
- verify OCR worker `/health` reports `paddleocrAvailable: true` and `pdfRenderingAvailable: true`
- restore DB only if migration caused incompatible data change
- verify login and stock pages
- document incident

### Disaster Recovery

- install Ubuntu
- install PostgreSQL, Node, Nginx
- restore `/opt/certistock/.env`
- restore latest DB dump
- restore `files.tar.zst`
- restore Nginx/systemd configs
- start services
- verify desktop clients connect
- perform sample upload and report download
