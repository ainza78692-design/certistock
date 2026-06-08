import * as XLSX from "xlsx";
import { normalizeProductKeyDetailed } from "@/lib/extraction/normalizeProductKey";

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

export interface TcConsumptionTarget {
  certBody: string;           // "IDFL" | "Non" | raw value
  tcNumber: string;           // e.g. "IDF-25-888845"
  sheetRef: number | null;    // backwards-compatible alias for shipmentNo when numeric
  shipmentNo: string | null;  // Excel "Sheet" value; this maps to shipments.shipment_no
  consumedWeightKg: number;   // C.wt from extended column
  lossPercent?: number | null; // Excel Loss % for this TC block; used to calculate outward certified weight
}

export interface SaledumpRow {
  rowIndex: number;
  invoiceNo: string;
  invoiceDate: string | null;
  ewayBillNo: string;
  ewayBillDate: string | null;
  sellerName: string;
  buyerName: string;
  buyerAddress: string;
  consigneeName: string;
  consigneeAddress: string;
  poNo: string;
  composition: string;
  count: string;
  construction: string;
  gsm: number | null;
  width: number | null;
  certWeightKg: number | null;   // base C.Wt. column (col R)
  grossWeightKg: number | null;  // GR.Wt.
  netWeightKg: number | null;    // Nt.Wt.
  quantity: number | null;
  uom: string;
  style: string;
  shade: string;
  recyclePercent: number | null;
  // TC consumption targets (from extended columns)
  tcEntries: TcConsumptionTarget[];
  lossPercent: number | null;
  // Derived
  normalizedYarnKey: string | null;
}

export type SaledumpFormat = "A" | "B" | "C";
// A = dual TC (IDFL + Non per row)
// B = single TC
// C = basic (no TC info)

export interface ParsedSaledump {
  format: SaledumpFormat;
  fileName: string;
  sheetName: string;
  rows: SaledumpRow[];
  headerRowIndex: number;
}

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

/** Convert Excel serial date number to ISO date string */
export function excelSerialToDate(serial: number): string | null {
  if (!serial || !Number.isFinite(serial) || serial < 1) return null;
  // Excel epoch: Jan 0, 1900 (with the Lotus 123 leap year bug)
  const utcDays = serial - 25569; // days since Unix epoch
  const utcMs = utcDays * 86400 * 1000;
  const d = new Date(utcMs);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toStr(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v).trim();
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseShipmentNo(v: unknown): string | null {
  const s = toStr(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && String(n) === s ? String(n) : s;
}

function normalizeHeader(v: unknown): string {
  return toStr(v).toUpperCase().replace(/\s+/g, " ").trim();
}

function parseDateCell(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return excelSerialToDate(v);
  const s = String(v).trim();
  // Try ISO-like
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Try dd/mm/yyyy or mm/dd/yyyy
  const parts = s.split(/[/.-]/);
  if (parts.length === 3) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Find the header row index by looking for "Invoice No." */
function findHeaderRow(data: unknown[][]): number {
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const row = data[i];
    if (!row) continue;
    const joined = row.map((c) => toStr(c).toUpperCase()).join("|");
    if (joined.includes("INVOICE NO")) return i;
  }
  return -1;
}

/** Detect the saledump format by examining the header columns */
function detectFormat(header: unknown[]): SaledumpFormat {
  const cols = header.map((c) => toStr(c).toUpperCase().trim());
  // Look for extended TC columns after column X (index 24+)
  const extendedStart = 24;
  const extendedCols = cols.slice(extendedStart);
  const extStr = extendedCols.join("|");

  // Format A: has two sets of "IDFL / Non IDFL" + "TC Number" + "C.wt"
  const idflMatches = extendedCols.filter((c) => c.includes("IDFL")).length;
  const tcMatches = extendedCols.filter((c) => c.includes("TC")).length;
  if (idflMatches >= 2 && tcMatches >= 2) return "A";

  // Format B: has one set of "TC Number" + "C.wt"
  if (tcMatches >= 1 || extStr.includes("TC NUMBER")) return "B";

  // Format C: basic
  return "C";
}

/* ──────────────────────────────────────────────
   Column Mapping (base columns 0–23)
   ────────────────────────────────────────────── */
const BASE = {
  invoiceNo:   0,   // A
  invoiceDt:   1,   // B
  ewayBillNo:  2,   // C
  ewayBillDt:  3,   // D
  sellerName:  4,   // E
  sellerAddr:  5,   // F
  // col 6 empty
  buyerName:   7,   // H
  buyerAddr:   8,   // I
  consignee:   9,   // J
  consAddr:    10,  // K
  poNo:        11,  // L
  composition: 12,  // M
  count:       13,  // N
  construction:14,  // O
  gsm:         15,  // P
  width:       16,  // Q
  certWt:      17,  // R  C.Wt.
  grossWt:     18,  // S  GR.Wt.
  netWt:       19,  // T  Nt.Wt.
  qty:         20,  // U
  uom:         21,  // V
  style:       22,  // W
  shade:       23,  // X
};

const EXTENDED_START = 24;

function isCertBodyHeader(v: unknown): boolean {
  const h = normalizeHeader(v);
  return h.includes("IDFL") && h.includes("NON");
}

function isTcNumberHeader(v: unknown): boolean {
  const h = normalizeHeader(v);
  return h.includes("TC") && h.includes("NUMBER");
}

function isSheetHeader(v: unknown): boolean {
  return normalizeHeader(v) === "SHEET";
}

function isConsumedWeightHeader(v: unknown): boolean {
  const h = normalizeHeader(v).replace(/\s+/g, "");
  return h === "C.WT" || h === "C.WT.";
}

function isLossHeader(v: unknown): boolean {
  return normalizeHeader(v).replace(/\s+/g, "") === "LOSS";
}

function findHeaderIndex(header: unknown[], start: number, end: number, predicate: (v: unknown) => boolean): number {
  for (let i = start; i < end; i++) {
    if (predicate(header[i])) return i;
  }
  return -1;
}

/* ──────────────────────────────────────────────
   Parse extended TC columns
   ────────────────────────────────────────────── */

function parseExtendedColumnsFormatA(row: unknown[], header: unknown[]): {
  recyclePercent: number | null;
  tcEntries: TcConsumptionTarget[];
  lossPercent: number | null;
} {
  // Format A has two TC blocks. Some exports include Loss after each C.wt,
  // so use headers instead of fixed indexes to avoid shifting the second block.
  const recyclePercent = toNum(row[24]);
  const entries: TcConsumptionTarget[] = [];
  const certBodyColumns = header
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell, index }) => index >= EXTENDED_START && isCertBodyHeader(cell))
    .map(({ index }) => index);
  const losses: number[] = [];

  for (let blockIndex = 0; blockIndex < certBodyColumns.length; blockIndex++) {
    const start = certBodyColumns[blockIndex];
    const end = certBodyColumns[blockIndex + 1] ?? header.length;
    const tcCol = findHeaderIndex(header, start + 1, end, isTcNumberHeader);
    const sheetCol = findHeaderIndex(header, start + 1, end, isSheetHeader);
    const weightCol = findHeaderIndex(header, start + 1, end, isConsumedWeightHeader);
    const lossCol = findHeaderIndex(header, start + 1, end, isLossHeader);

    const certBody = toStr(row[start]) || (blockIndex === 0 ? "IDFL" : "Non");
    const tcNumber = tcCol >= 0 ? toStr(row[tcCol]) : "";
    const sheetRef = sheetCol >= 0 ? toNum(row[sheetCol]) : null;
    const consumedWeightKg = weightCol >= 0 ? toNum(row[weightCol]) : null;
    const lossPercent = lossCol >= 0 ? toNum(row[lossCol]) : null;
    if (lossPercent !== null) losses.push(lossPercent);

    if (tcNumber && consumedWeightKg && consumedWeightKg > 0) {
      entries.push({
        certBody,
        tcNumber,
        sheetRef,
        shipmentNo: sheetCol >= 0 ? parseShipmentNo(row[sheetCol]) : null,
        consumedWeightKg,
        lossPercent,
      });
    }
  }

  const lossPercent = losses.length ? losses[losses.length - 1] : null;
  return { recyclePercent, tcEntries: entries, lossPercent };
}

function parseExtendedColumnsFormatB(row: unknown[], header: unknown[]): {
  recyclePercent: number | null;
  tcEntries: TcConsumptionTarget[];
  lossPercent: number | null;
} {
  // Format B layout after column 23 (shade):
  // 24: Recy%
  // 25: IDFL / Non IDFL
  // 26: TC Number
  // 27: Sheet
  // 28: C.wt
  // 29: Loss
  const recyclePercent = toNum(row[24]);
  const entries: TcConsumptionTarget[] = [];

  const cb = toStr(row[25]);
  const tc = toStr(row[26]);
  const sh = toNum(row[27]);
  const cw = toNum(row[28]);
  const lossPercent = toNum(row[29]);
  if (tc && cw && cw > 0) {
    entries.push({
      certBody: cb || "Unknown",
      tcNumber: tc,
      sheetRef: sh,
      shipmentNo: parseShipmentNo(row[27]),
      consumedWeightKg: cw,
      lossPercent,
    });
  }

  return { recyclePercent, tcEntries: entries, lossPercent };
}

/* ──────────────────────────────────────────────
   Normalize the Count / yarn key from the saledump
   ────────────────────────────────────────────── */

function normalizeCountField(count: string, composition: string): string | null {
  const result = normalizeProductKeyDetailed({
    additionalInfoRaw: composition,
    yarnCountRaw: count,
    articleNo: null,
  });
  return result.normalizedKey;
}

/* ──────────────────────────────────────────────
   Main parser
   ────────────────────────────────────────────── */

export async function parseSaledumpFile(file: File): Promise<ParsedSaledump> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  // Use the first sheet that has data (some files have a summary second sheet)
  let sheetName = wb.SheetNames[0];
  let ws = wb.Sheets[sheetName];
  let data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  // If first sheet has no "Invoice No." header, try subsequent sheets
  let headerIdx = findHeaderRow(data);
  if (headerIdx < 0 && wb.SheetNames.length > 1) {
    for (let i = 1; i < wb.SheetNames.length; i++) {
      sheetName = wb.SheetNames[i];
      ws = wb.Sheets[sheetName];
      data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      headerIdx = findHeaderRow(data);
      if (headerIdx >= 0) break;
    }
  }

  if (headerIdx < 0) {
    throw new Error(
      "Could not find a header row containing 'Invoice No.' in this file. " +
      "Please ensure this is a valid saledump export."
    );
  }

  const header = data[headerIdx] as unknown[];
  const format = detectFormat(header);
  const rows: SaledumpRow[] = [];

  for (let i = headerIdx + 1; i < data.length; i++) {
    const raw = data[i] as unknown[];
    if (!raw || !raw.length) continue;

    const invoiceNo = toStr(raw[BASE.invoiceNo]);
    // Skip empty rows or repeated header rows
    if (!invoiceNo || invoiceNo.toUpperCase() === "INVOICE NO.") continue;

    const count = toStr(raw[BASE.count]);
    const composition = toStr(raw[BASE.composition]);
    const normalizedYarnKey = normalizeCountField(count, composition);

    let tcEntries: TcConsumptionTarget[] = [];
    let recyclePercent: number | null = null;
    let lossPercent: number | null = null;

    if (format === "A") {
      const ext = parseExtendedColumnsFormatA(raw, header);
      tcEntries = ext.tcEntries;
      recyclePercent = ext.recyclePercent;
      lossPercent = ext.lossPercent;
    } else if (format === "B") {
      const ext = parseExtendedColumnsFormatB(raw, header);
      tcEntries = ext.tcEntries;
      recyclePercent = ext.recyclePercent;
      lossPercent = ext.lossPercent;
    }

    rows.push({
      rowIndex: i,
      invoiceNo,
      invoiceDate: parseDateCell(raw[BASE.invoiceDt]),
      ewayBillNo: toStr(raw[BASE.ewayBillNo]),
      ewayBillDate: parseDateCell(raw[BASE.ewayBillDt]),
      sellerName: toStr(raw[BASE.sellerName]),
      buyerName: toStr(raw[BASE.buyerName]),
      buyerAddress: toStr(raw[BASE.buyerAddr]),
      consigneeName: toStr(raw[BASE.consignee]),
      consigneeAddress: toStr(raw[BASE.consAddr]),
      poNo: toStr(raw[BASE.poNo]),
      composition,
      count,
      construction: toStr(raw[BASE.construction]),
      gsm: toNum(raw[BASE.gsm]),
      width: toNum(raw[BASE.width]),
      certWeightKg: toNum(raw[BASE.certWt]),
      grossWeightKg: toNum(raw[BASE.grossWt]),
      netWeightKg: toNum(raw[BASE.netWt]),
      quantity: toNum(raw[BASE.qty]),
      uom: toStr(raw[BASE.uom]),
      style: toStr(raw[BASE.style]),
      shade: toStr(raw[BASE.shade]),
      recyclePercent,
      tcEntries,
      lossPercent,
      normalizedYarnKey,
    });
  }

  return { format, fileName: file.name, sheetName, rows, headerRowIndex: headerIdx };
}
