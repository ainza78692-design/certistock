# Mass Balance XLSX Automation

The app keeps one private Mass Balance workbook per approved product lot.

Flow:

1. User records consumption from a specific shipment lot.
2. `record-consumption` Edge Function creates the outward sale and calls `consume_stock`.
3. The Edge Function builds a safe payload from Supabase rows.
4. The Python worker renders `Mass Balance Sheet` from `ocr-worker/templates/mass_balance_template.xlsx`.
5. The Edge Function uploads the latest XLSX to the private `mass-balance-xlsx` bucket.
6. `mass_balance_workbooks` stores status, storage path, row count, and generation time.

The worker never receives Supabase service-role keys. It only returns XLSX bytes.

Environment:

- `OCR_WORKER_URL`: current Python worker URL.
- `MASS_BALANCE_WORKER_URL`: optional separate worker URL; falls back to `OCR_WORKER_URL`.
- `OCR_WORKER_API_KEY`: shared worker bearer token.

Safety rule:

OCR/AI extraction still only pre-fills review. Stock and Mass Balance updates happen only after human-approved stock lots and explicit consumption entries.
