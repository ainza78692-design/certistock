/**
 * Clean composition text for outward Mass Balance Product Name cells.
 * Removes only one leading numeric item/code token, while preserving percentages.
 */
export function cleanCompositionForMassBalance(value: string | null | undefined): string {
  return String(value || "").replace(/^\s*\d+\s+/, "").replace(/\s+/g, " ").trim();
}

/**
 * Existing inward/product-name cleanup. Kept separate so inward data behavior stays unchanged.
 */
function cleanProductNamePart(name: string | null | undefined): string {
  if (!name) return "";

  const trimmed = name.trim();
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (match && !trimmed.includes("%")) {
    return match[2].trim();
  }

  return trimmed;
}

export function buildCombinedProductName(
  parts: (string | null | undefined)[]
): string {
  return parts
    .filter((p) => p && p.trim())
    .map((p) => cleanProductNamePart(p))
    .filter((p) => p)
    .join(" - ");
}
