# CertiStock OCR and Mass Balance Worker

This worker is required for production CertiStock deployments.

It exposes:

- `GET /health`
- `POST /ocr`
- `POST /mass-balance/render`

The Node API expects it at:

```text
http://127.0.0.1:8001
```

## Install

Basic worker:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

Production scanned-PDF OCR:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements-paddleocr.txt
```

On Linux:

```bash
python3 -m venv venv
./venv/bin/python -m pip install --upgrade pip
./venv/bin/python -m pip install -r requirements.txt
./venv/bin/python -m pip install -r requirements-paddleocr.txt
```

## Run

```powershell
.\venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8001
```

## Production Gate

`/health` must show:

```json
{
  "ok": true,
  "paddleocrAvailable": true
}
```

If `paddleocrAvailable` is false, selectable/native PDFs and Mass Balance XLSX can still work, but scanned PDFs are not production-ready.
