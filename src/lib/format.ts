import { normalizeProductKey } from "@/lib/extraction/normalizeProductKey";

export const fmtKg = (n: number | null | undefined, decimals = 3) => {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + " kg";
};

export const fmtNum = (n: number | null | undefined, decimals = 0) => {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return d; }
};

const KEYS = ["50/45","50/48","75/72","150/48","20/1","50D","70D","75D","150D","30D"];

export { normalizeProductKey };
export const PRODUCT_KEYS = KEYS;
