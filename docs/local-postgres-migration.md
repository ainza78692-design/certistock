# CertiStock Local PostgreSQL Migration Plan

## Goal

Run CertiStock fully inside the client's office LAN:

```text
Windows server PC
-> PostgreSQL
-> CertiStock local API
-> Python OCR/XLSX worker
-> local file storage

Office users on same Wi-Fi/LAN
-> CertiStock .exe
-> http://SERVER-IP:8787
```

The current Supabase/Vercel version should stay working until the local path is proven.

## Why This Is Not A Simple Database Swap

The current app uses Supabase for:

- Auth
- PostgREST queries from the frontend
- Storage buckets for PDFs and XLSX files
- Edge Functions for extraction, consumption, deletion, and mass balance generation
- SQL RPCs for stock transactions
- RLS/company isolation

Local PostgreSQL replaces only the database layer. The other Supabase services need local equivalents.

## Recommended Local Architecture

Use native PostgreSQL plus a local Node API, not local Supabase.

This is best for the client's space constraint because it avoids Docker/Supabase stack overhead.

Services:

- `PostgreSQL`: database of record.
- `CertiStock local API`: auth, company isolation, file upload/download, extraction orchestration, stock transactions.
- `OCR worker`: existing Python FastAPI worker with PaddleOCR and Mass Balance XLSX generation.
- `CertiStock .exe`: Electron shell around the React app.

## Current First Slice Implemented

Added:

- `server/src/index.ts`: Fastify local API entry.
- `server/src/config.ts`: local config/env.
- `server/src/db.ts`: PostgreSQL pool and transaction helper.
- `server/src/auth.ts`: JWT auth helpers.
- `server/src/routes/auth.ts`: local signup/login/me.
- `server/src/routes/health.ts`: API and DB health check.
- `server/sql/001_local_postgres_schema.sql`: plain PostgreSQL schema.
- Package scripts:
  - `npm run server:dev`
  - `npm run server:build`
  - `npm run server:start`
- Local API endpoints for auth, dashboard, uploads, stock lots, consumption, products, entities, and mass balance.
- Local setup scripts:
  - `scripts/local-setup.ps1`
  - `scripts/local-backup.ps1`
  - `scripts/register-local-services.ps1`

The local schema removes Supabase-only dependencies:

- no `auth.users`
- no RLS
- no Supabase Storage tables
- no `auth.uid()`

Company isolation moves to the API using the signed JWT.

## Local Setup For Laptop Test

### Option A: Folder-Local PostgreSQL Binaries

This repo can run PostgreSQL from the downloaded ZIP binaries without a system-wide installer:

```text
tools/postgresql-17.9/pgsql
data/postgres
```

Start/stop commands:

```powershell
.\scripts\start-local-postgres.ps1
.\scripts\stop-local-postgres.ps1
```

The local dev database uses:

```text
postgres superuser password: certistock
app database: certistock_utf8
app user: certistock
app password: certistock
```

### Option B: System PostgreSQL Installer

1. Install PostgreSQL 16 or 17 for Windows.

2. Create local DB/user:

```powershell
psql -U postgres
```

```sql
create user certistock with password 'certistock';
create database certistock_utf8 owner certistock encoding 'UTF8' template template0 locale 'C';
\q
```

3. Apply schema:

```powershell
cd "C:\Users\Mohammad Anas\Desktop\stockguard-pro-main"
psql "postgres://certistock:certistock@127.0.0.1:5432/certistock_utf8" -f server/sql/001_local_postgres_schema.sql
```

4. Start OCR worker:

```powershell
cd "C:\Users\Mohammad Anas\Desktop\stockguard-pro-main\ocr-worker"
.\venv\Scripts\Activate.ps1
python -m uvicorn app:app --host 0.0.0.0 --port 8001
```

5. Start local API:

```powershell
cd "C:\Users\Mohammad Anas\Desktop\stockguard-pro-main"
npm run server:dev
```

6. Check health:

```powershell
Invoke-WebRequest http://127.0.0.1:8787/health -UseBasicParsing
```

## Implemented Local API Surface

Current local routes:

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
- `GET /api/outward-sales`
- `GET /api/product-master`
- `POST /api/product-master`
- `POST /api/product-aliases`
- `DELETE /api/product-aliases/:id`
- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/customers`
- `POST /api/customers`

## Remaining Migration Work

### Phase 1: Backend Feature Parity

Move the final high-fidelity parser pieces from the Supabase Edge Function into the local API:

- strict OpenRouter fallback, optional Gemini fallback, and Document AI fallback
- exact regex helper parity with `supabase/functions/extract-tc/helpers.ts`
- local API tests for TC extraction approval

Move file storage to:

```text
data/files/tc-pdfs/{company_id}/...
data/files/mass-balance-xlsx/{company_id}/...
```

The API must authorize every file request by company.

### Phase 2: Frontend API Client

Add a data access layer:

```text
src/lib/dataClient.ts
src/lib/localApiClient.ts
src/lib/supabaseDataClient.ts
```

Then switch page by page from direct `supabase.from(...)` calls to the data client.

Priority order:

1. Auth - started
2. Dashboard read queries - started
3. Upload PDFs - started
4. Review extraction approval - started
5. Stock lots - started
6. Consumption manual - started
7. Mass balance download/regenerate - started
8. Bulk Excel consumption - started
9. Settings/product master/customers/suppliers/reports - started

### Phase 3: Windows Server Startup

On the office server PC, configure automatic startup:

- PostgreSQL Windows Service
- OCR worker Windows Service
- CertiStock local API Windows Service

Recommended service tools:

- Windows Task Scheduler for simplest setup
- NSSM for more reliable service management

### Phase 4: LAN .exe Configuration

The `.exe` should read local API URL from a config file:

```text
CertiStock/config.json
{
  "apiUrl": "http://192.168.1.10:8787"
}
```

The server PC can use:

```text
http://127.0.0.1:8787
```

Other LAN PCs use:

```text
http://SERVER-LAN-IP:8787
```

## Storage Estimate

Native PostgreSQL local install:

- PostgreSQL base: about `200-500 MB`
- Node API dependencies: about `200-500 MB`
- OCR Python environment and PaddleOCR: about `2-6 GB`
- Electron installer/app: about `300-600 MB`
- First-year business data for light usage: usually less than `1-3 GB`

Recommended free disk:

```text
Minimum: 15 GB
Comfortable: 25-40 GB
```

## Risk Notes

- Local DB will not pause like Supabase free cloud.
- Data safety depends on backups. Add daily automatic backup before client deployment.
- The server PC must stay on for other office users.
- LAN IP should be static or reserved in router DHCP.
- Antivirus/firewall may block ports `8787` and `8001` until allowed.
