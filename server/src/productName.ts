const cleanPart = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

export function buildCombinedProductName(parts: Array<unknown>) {
  const cleaned = parts.map(cleanPart).filter(Boolean);
  return cleaned.length ? cleaned.join(" - ") : null;
}
