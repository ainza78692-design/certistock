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

    # ── Exact colours from reference file ────────────────────────────────────
    BLUE       = PatternFill("solid", fgColor="FF5B9BD5")  # title / inward section
    LT_BLUE    = PatternFill("solid", fgColor="FFBDD7EE")  # outward section
    GREEN      = PatternFill("solid", fgColor="FFA9D08E")  # stock details section
    YELLOW     = PatternFill("solid", fgColor="FFFFFF00")  # production capacity
    CREAM      = PatternFill("solid", fgColor="FFFFF2CC")  # storage capacity

    # ── Fonts ────────────────────────────────────────────────────────────────
    F_TITLE = Font(name="Book Antiqua", size=16, bold=True)
    F_H14   = Font(name="Book Antiqua", size=14, bold=True)
    F_H11   = Font(name="Book Antiqua", size=11, bold=True)
    F_D11   = Font(name="Calibri", size=11)
    F_D10   = Font(name="Calibri", size=10)

    # ── Alignments ───────────────────────────────────────────────────────────
    A_CC  = Alignment(horizontal="center", vertical="center", wrap_text=True)
    A_LT  = Alignment(horizontal="left",   vertical="top")
    A_CB  = Alignment(horizontal="center", vertical="bottom")
    A_LC  = Alignment(horizontal="left",   vertical="center", wrap_text=True)
    A_CCS = Alignment(horizontal="center", vertical="center")  # no wrap

    # ── Column widths (pixel-perfect from reference) ──────────────────────────
    for col, w in [("A",7.14),("B",30.14),("C",19.29),("D",32.29),("E",15.0),
                   ("F",13.43),("G",15.0),("H",13.14),("I",8.71),("J",14.86),
                   ("K",28.43),("L",13.57),("M",31.86),("N",17.0),("O",14.86),
                   ("P",14.86),("Q",14.86),("R",18.43),("S",11.14),("T",19.14),
                   ("U",24.57)]:
        ws.column_dimensions[col].width = w

    def sc(row, col, val, font, fill=None, align=None):
        """Set cell value + style."""
        c = ws.cell(row=row, column=col, value=val)
        c.font = font
        if fill:  c.fill = fill
        if align: c.alignment = align
        return c

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 1-2  Title banner  A1:U2
    # ══════════════════════════════════════════════════════════════════════════
    ws.merge_cells("A1:U2")
    ws.row_dimensions[1].height = 20
    ws.row_dimensions[2].height = 20
    sc(1, 1, "Mass Balance Sheet", F_TITLE, BLUE, A_CB)

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 3  Production / Storage capacity bar
    # ══════════════════════════════════════════════════════════════════════════
    ws.row_dimensions[3].height = 20.25
    sc(3, 1, None, F_TITLE, BLUE, A_CB)          # A3 blue filler
    ws.merge_cells("B3:J3")
    sc(3, 2, "Production Capacity :", F_TITLE, YELLOW, A_LT)
    ws.merge_cells("K3:U3")
    sc(3, 11, "Storage Capacity :", F_TITLE, CREAM, A_LT)

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 4  Section header band
    # ══════════════════════════════════════════════════════════════════════════
    ws.row_dimensions[4].height = 18.75
    ws.merge_cells("A4:A5")                       # Sr.No spans rows 4-5
    sc(4, 1,  "Sr.No ",                         F_H11, BLUE,    A_CC)
    ws.merge_cells("B4:H4")
    sc(4, 2,  "Inword Data [Input TC]",          F_H14, BLUE,    A_LT)
    sc(4, 9,  None,                              F_H14, BLUE,    A_CC)  # I4 blue gap
    ws.merge_cells("J4:S4")
    sc(4, 10, f"Outward Data[ Applied TC] {date.today().strftime('%d.%m.%y')}",
              F_H14, LT_BLUE, A_LT)
    ws.merge_cells("T4:U4")
    sc(4, 20, "Stock Details",                   F_H14, GREEN,   A_CC)

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 5  Column headers
    # ══════════════════════════════════════════════════════════════════════════
    ws.row_dimensions[5].height = 60.0
    for col, fill, label in [
        ( 2, BLUE,    "Suppliers Name [Input TC ]"),
        ( 3, BLUE,    "Product Name and Quality"),
        ( 4, BLUE,    "Input TC No (IDFL or Other CB)"),
        ( 5, BLUE,    "Certified Weight(Kg)"),
        ( 6, BLUE,    "Net Wt (Kg.)"),
        ( 7, BLUE,    "Gross Weight (Kg.)"),
        ( 8, BLUE,    "Lot No/Batch No"),
        ( 9, BLUE,    "Open Stock in Kgs."),
        (10, LT_BLUE, "Consumed wt/ Raw Material used [ Kg]"),
        (11, LT_BLUE, "Product Name"),
        (12, LT_BLUE, "Loss(%)"),
        (13, LT_BLUE, "Buyers Name"),
        (14, LT_BLUE, "Invoice No."),
        (15, LT_BLUE, "Net weight[Kg]"),
        (16, LT_BLUE, "Certified Weight(Kg)"),
        (17, LT_BLUE, "Gross Weight(Kg)"),
        (18, LT_BLUE, "Transport Details(BL No/Challan No)"),
        (19, LT_BLUE, "Standard"),
        (20, GREEN,   "Applied IDFL TC Id."),
        (21, GREEN,   "Remaining Raw Material in Input TC(Kg)"),
    ]:
        sc(5, col, label, F_H11, fill, A_CC)

    # ══════════════════════════════════════════════════════════════════════════
    # DATA ROWS  (row 6 onward)
    # ══════════════════════════════════════════════════════════════════════════
    supplier    = payload.supplier.get("supplier_name") or ""
    product_raw = payload.lot.get("normalized_yarn_key") or payload.lot.get("additional_info_raw") or ""
    tc_number   = payload.tc.get("tc_number") or ""
    cert_wt     = number_value(payload.tc.get("certified_weight_kg"))
    net_wt      = number_value(payload.tc.get("net_shipping_weight_kg"))
    gross_wt    = number_value(payload.tc.get("gross_shipping_weight_kg"))
    opening_stk = number_value(payload.lot.get("opening_stock_kg"))
    standard    = payload.tc.get("standard") or ""
    START       = 6
    n           = len(payload.consumptions)

    for idx, entry in enumerate(payload.consumptions):
        r    = START + idx
        sale = entry.get("outward_sale") or {}

        # Row heights matching reference exactly
        if   idx < 8:  ws.row_dimensions[r].height = 100.0
        elif idx < 14: ws.row_dimensions[r].height = 45.0
        else:          ws.row_dimensions[r].height = 16.5

        # A – serial number (first row only)
        if idx == 0:
            sc(r, 1, 1, F_D11, align=A_CCS)

        # B-H – inward static data (first row only, same for every row in reference)
        if idx == 0:
            sc(r,  2, supplier,    F_D10, align=A_CCS)
            sc(r,  3, product_raw, F_D11, align=A_LC)
            sc(r,  4, tc_number,   F_D10, align=A_CCS)
            sc(r,  5, cert_wt,     F_D11, align=A_CC)
            sc(r,  6, net_wt,      F_D11, align=A_CC)
            sc(r,  7, gross_wt,    F_D11, align=A_CC)
            # H (col 8) = Lot No – reference leaves this blank in data rows

        # I – open/running stock
        if idx == 0:
            sc(r, 9, opening_stk, F_D11, align=A_CC)
        else:
            sc(r, 9, f"=U{r - 1}", F_D10, align=A_CC)

        # J – consumed weight
        sc(r, 10, number_value(entry.get("consumed_weight_kg")), F_D11, align=A_CC)

        # K – outward product name
        sc(r, 11, sale.get("product_name") or product_raw, F_D11, align=A_CC)

        # L – loss % (live formula)
        sc(r, 12, f"=(1-P{r}/J{r})*100", F_D11, align=A_CC)

        # M – buyer
        sc(r, 13, sale.get("customer_name_snapshot") or "", F_D11, align=A_CC)

        # N – invoice no
        sc(r, 14, sale.get("outward_invoice_no") or "", F_D11, align=A_CC)

        # O – outward net weight
        sc(r, 15, number_value(sale.get("outward_net_weight_kg")), F_D11, align=A_CC)

        # P – outward certified weight
        out_cert = number_value(entry.get("outward_certified_weight_kg")) \
                   or number_value(sale.get("outward_certified_weight_kg"))
        sc(r, 16, out_cert, F_D11, align=A_CC)

        # Q – outward gross weight
        sc(r, 17, number_value(sale.get("outward_gross_weight_kg")), F_D11, align=A_CC)

        # R – transport / challan
        sc(r, 18, sale.get("transport_doc_no") or sale.get("vehicle_no") or "", F_D11, align=A_CC)

        # S – standard
        sc(r, 19, standard, F_D11, align=A_CC)

        # T – applied outward TC
        sc(r, 20, sale.get("outward_tc_no") or "", F_D11, align=A_CC)

        # U – remaining stock formula
        sc(r, 21, f"=I{r}-J{r}", F_D11, align=A_CC)

    # ── Trailing blank formula rows (matches reference rows 20-35) ────────────
    last = START + n - 1
    for er in range(last + 1, last + 17):
        ws.row_dimensions[er].height = 16.5
        sc(er, 9,  f"=U{er - 1}",              F_D10, align=A_CC)
        sc(er, 12, f"=(1-P{er}/J{er})*100",    F_D11, align=A_LC)
        sc(er, 21, f"=I{er}-J{er}",            F_D11, align=A_CC)

    # ── Serialise ─────────────────────────────────────────────────────────────
    stream = io.BytesIO()
    wb.save(stream)
    content_base64 = base64.b64encode(stream.getvalue()).decode("ascii")

    shipment_no = payload.shipment.get("shipment_no") or payload.lot.get("product_no") or "shipment"
    product_key = payload.lot.get("normalized_yarn_key") or "product"
    file_name   = f"{tc_number}_{shipment_no}_{product_key}.xlsx".replace("/", "-")

    return {
        "fileName":      file_name,
        "contentBase64": content_base64,
        "rowCount":      n,
    }
