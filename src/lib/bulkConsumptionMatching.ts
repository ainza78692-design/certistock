export type BulkLotLike = {
  id: string;
  normalized_yarn_key?: string | null;
  remaining_stock_kg?: number | null;
  certified_weight_kg?: number | null;
  article_no?: string | null;
  created_at?: string | null;
  transaction_certificates?: { tc_number?: string | null } | null;
  shipments?: { shipment_no?: string | number | null; shipment_date?: string | null } | null;
};

export type LotMatchResult =
  | { kind: "matched"; lot: BulkLotLike }
  | { kind: "partial"; lot: BulkLotLike }
  | { kind: "ambiguous"; candidates: BulkLotLike[] }
  | { kind: "unmatched" };

export function normalizeBulkTc(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeShipmentNo(value: string | number | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(numeric) : raw.toUpperCase().replace(/\s+/g, "");
}

function tcMatches(inputTc: string, lotTc: string): boolean {
  const cleanInput = normalizeBulkTc(inputTc);
  const cleanLot = normalizeBulkTc(lotTc);
  return !!cleanInput && !!cleanLot && (cleanInput === cleanLot || cleanInput.includes(cleanLot) || cleanLot.includes(cleanInput));
}

export function findLotByTcShipment(params: {
  lots: BulkLotLike[] | null | undefined;
  tcNumber: string;
  shipmentNo?: string | number | null;
  yarnKey?: string | null;
  neededKg: number;
}): LotMatchResult {
  const { lots, tcNumber, shipmentNo, yarnKey, neededKg } = params;
  if (!lots?.length) return { kind: "unmatched" };

  let candidates = lots.filter((lot) => tcMatches(tcNumber, lot.transaction_certificates?.tc_number || ""));
  if (!candidates.length) return { kind: "unmatched" };

  const cleanShipmentNo = normalizeShipmentNo(shipmentNo);
  if (cleanShipmentNo) {
    candidates = candidates.filter((lot) => normalizeShipmentNo(lot.shipments?.shipment_no) === cleanShipmentNo);
    if (!candidates.length) return { kind: "unmatched" };
  }

  if (candidates.length > 1 && yarnKey) {
    const yarnMatches = candidates.filter((lot) => lot.normalized_yarn_key === yarnKey);
    if (yarnMatches.length > 0) candidates = yarnMatches;
  }

  if (candidates.length > 1) {
    return { kind: "ambiguous", candidates };
  }

  const lot = candidates[0];
  return (lot.remaining_stock_kg || 0) >= neededKg
    ? { kind: "matched", lot }
    : { kind: "partial", lot };
}

export function buildBulkLotLabel(lot: BulkLotLike | null | undefined): string {
  if (!lot) return "";
  const tc = lot.transaction_certificates?.tc_number || "?";
  const shipmentNo = lot.shipments?.shipment_no || "?";
  const shipmentDate = lot.shipments?.shipment_date || "?";
  const key = lot.normalized_yarn_key || "?";
  const remaining = typeof lot.remaining_stock_kg === "number" ? `${lot.remaining_stock_kg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg` : "? kg";
  return `${key} - ${tc} - Ship ${shipmentNo} - ${shipmentDate} - ${remaining}`;
}
