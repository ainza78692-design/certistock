import type { DbClient } from "./db.js";
import { normalizeProductKey } from "./extraction/simpleParser.js";

export const normalizeInvoiceNo = (value: unknown) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

export const splitInvoiceReferences = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return [];
  return text
    .split(/\s*(?:,|;|\n|\r|\band\b)\s*/i)
    .map(normalizeInvoiceNo)
    .filter(Boolean);
};

export async function reconcileIncomingStockForInvoices(input: {
  client: DbClient;
  companyId: string;
  tcId: string;
  invoiceReferences: unknown[];
  excludeIncomingStockIds?: unknown[];
}) {
  const invoiceNos = Array.from(
    new Set(input.invoiceReferences.flatMap(splitInvoiceReferences).filter(Boolean)),
  );
  const excludeIncomingStockIds = Array.from(
    new Set((input.excludeIncomingStockIds || []).map((id) => String(id || "").trim()).filter(Boolean)),
  );

  if (!invoiceNos.length) {
    return { matched: [], matchedCount: 0 };
  }

  const result = await input.client.query(
    `delete from incoming_stock
     where company_id = $1
       and upper(btrim(invoice_no)) = any($2::text[])
       and (cardinality($3::uuid[]) = 0 or id <> all($3::uuid[]))
     returning *`,
    [input.companyId, invoiceNos, excludeIncomingStockIds],
  );

  return {
    matched: result.rows,
    matchedCount: result.rowCount || 0,
  };
}

export function normalizedIncomingYarnKey(yarnCount: string) {
  return normalizeProductKey(yarnCount) || yarnCount.trim().toUpperCase() || null;
}
