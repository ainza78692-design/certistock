from __future__ import annotations

import base64
import io
import os
from datetime import date
from importlib.util import find_spec
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from pydantic import BaseModel

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional import guard
    PdfReader = None  # type: ignore

APP_VERSION = "1.0.0"
WORKER_API_KEY = os.getenv("OCR_WORKER_API_KEY", "")

app = FastAPI(title="CertiStock OCR Worker", version=APP_VERSION)


class OcrRequest(BaseModel):
    content: str
    fileName: str | None = None
    mimeType: str | None = "application/pdf"


class MassBalanceRequest(BaseModel):
    company_id: str | None = None
    transaction_certificate_id: str | None = None
    product_lot_id: str | None = None
    tc: dict[str, Any] = {}
    supplier: dict[str, Any] = {}
    shipment: dict[str, Any] = {}
    lot: dict[str, Any] = {}
    consumptions: list[dict[str, Any]] = []


def require_auth(authorization: str | None) -> None:
    if not WORKER_API_KEY:
        return
    expected = f"Bearer {WORKER_API_KEY}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid OCR worker API key")


def has_paddleocr() -> bool:
    return find_spec("paddleocr") is not None


def has_pdf_rendering() -> bool:
    return find_spec("fitz") is not None and find_spec("numpy") is not None


def extract_pdf_text_with_pypdf(content: bytes) -> str:
    if PdfReader is None:
        return ""


def extract_pdf_text_with_paddleocr(content: bytes) -> tuple[str, float | None, int]:
    try:
        import fitz  # type: ignore
        import numpy as np  # type: ignore
        from paddleocr import PaddleOCR  # type: ignore
    except Exception as exc:  # pragma: no cover - optional production path
        raise RuntimeError("PaddleOCR PDF rendering dependencies are not installed") from exc

    ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    doc = fitz.open(stream=content, filetype="pdf")
    chunks: list[str] = []
    confidences: list[float] = []

    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        result = ocr.ocr(image, cls=True)
        for page_result in result or []:
            for line in page_result or []:
                if not line or len(line) < 2:
                    continue
                text = line[1][0] if line[1] else ""
                confidence = line[1][1] if len(line[1]) > 1 else None
                if text:
                    chunks.append(str(text))
                if isinstance(confidence, (int, float)):
                    confidences.append(float(confidence) * 100 if confidence <= 1 else float(confidence))

    average = sum(confidences) / len(confidences) if confidences else None
    return "\n".join(chunks).strip(), average, len(doc)
    try:
        reader = PdfReader(io.BytesIO(content))
        pages = [(page.extract_text() or "") for page in reader.pages]
        return "\n".join(pages).strip()
    except Exception:
        return ""


def format_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def number_value(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "certistock-ocr-worker",
        "version": APP_VERSION,
        "pypdfAvailable": PdfReader is not None,
        "paddleocrAvailable": has_paddleocr(),
        "pdfRenderingAvailable": has_pdf_rendering(),
        "massBalanceAvailable": True,
    }


@app.post("/ocr")
def ocr(payload: OcrRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    try:
        content = base64.b64decode(payload.content, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 content") from exc

    text = extract_pdf_text_with_pypdf(content)
    if text:
        return {
            "text": text,
            "confidence": 75,
            "provider": "pypdf_worker_text",
            "pages": None,
        }

    if not has_paddleocr() or not has_pdf_rendering():
        raise HTTPException(
            status_code=503,
            detail=(
                "PaddleOCR or PDF rendering dependencies are not installed. Install ocr-worker/requirements-paddleocr.txt "
                "on the production server before scanned PDF OCR can be used."
            ),
        )

    try:
        ocr_text, confidence, pages = extract_pdf_text_with_paddleocr(content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PaddleOCR processing failed: {exc}") from exc

    if not ocr_text:
        raise HTTPException(status_code=422, detail="OCR completed but no text was detected")

    return {
        "text": ocr_text,
        "confidence": confidence,
        "provider": "paddleocr",
        "pages": pages,
    }


@app.post("/mass-balance/render")
def render_mass_balance(payload: MassBalanceRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)

    wb = Workbook()
    ws = wb.active
    ws.title = "Mass Balance Sheet"

    title_fill = PatternFill("solid", fgColor="1f4e79")
    header_fill = PatternFill("solid", fgColor="d9eaf7")
    title_font = Font(color="FFFFFF", bold=True, size=14)
    header_font = Font(bold=True)

    ws.merge_cells("A1:H1")
    ws["A1"] = "CertiStock Mass Balance Sheet"
    ws["A1"].font = title_font
    ws["A1"].fill = title_fill
    ws["A1"].alignment = Alignment(horizontal="center")

    info_rows = [
        ("Generated Date", date.today().isoformat()),
        ("TC Number", payload.tc.get("tc_number")),
        ("Supplier", payload.supplier.get("supplier_name")),
        ("Shipment No", payload.shipment.get("shipment_no")),
        ("Shipment Date", payload.shipment.get("shipment_date")),
        ("Product", payload.lot.get("normalized_yarn_key") or payload.lot.get("additional_info_raw")),
        ("Article No", payload.lot.get("article_no")),
        ("Opening Stock KG", payload.lot.get("opening_stock_kg")),
        ("Certified Weight KG", payload.lot.get("certified_weight_kg")),
    ]

    row = 3
    for label, value in info_rows:
        ws.cell(row=row, column=1, value=label).font = header_font
        ws.cell(row=row, column=2, value=format_value(value))
        row += 1

    row += 1
    headers = [
        "Date",
        "Invoice No",
        "Customer",
        "Product",
        "Consumed KG",
        "Outward Certified KG",
        "Loss %",
        "Closing Balance KG",
    ]
    for col, header in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill

    row += 1
    for entry in payload.consumptions:
        sale = entry.get("outward_sale") or {}
        values = [
            entry.get("consumption_date") or sale.get("outward_invoice_date"),
            sale.get("outward_invoice_no"),
            sale.get("customer_name_snapshot"),
            sale.get("product_name") or payload.lot.get("normalized_yarn_key"),
            number_value(entry.get("consumed_weight_kg")),
            number_value(entry.get("outward_certified_weight_kg")),
            number_value(entry.get("loss_percent")),
            number_value(entry.get("closing_balance_after_kg")),
        ]
        for col, value in enumerate(values, start=1):
            ws.cell(row=row, column=col, value=value)
        row += 1

    for col in range(1, 9):
        ws.column_dimensions[chr(64 + col)].width = 22

    stream = io.BytesIO()
    wb.save(stream)
    content_base64 = base64.b64encode(stream.getvalue()).decode("ascii")

    tc_number = payload.tc.get("tc_number") or "tc"
    shipment_no = payload.shipment.get("shipment_no") or payload.lot.get("product_no") or "shipment"
    product = payload.lot.get("normalized_yarn_key") or "product"
    file_name = f"{tc_number}_{shipment_no}_{product}.xlsx".replace("/", "-")

    return {
        "fileName": file_name,
        "contentBase64": content_base64,
        "rowCount": len(payload.consumptions),
    }
