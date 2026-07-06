/**
 * Strip numeric prefixes from composition names
 * e.g., "2616 Polyester" -> "Polyester"
 * but keep percentage information intact
 * e.g., "100% Polyester" -> "100% Polyester"
 */
function cleanCompositionName(name: string | null | undefined): string {
  if (!name) return "";
  
  const trimmed = name.trim();
  
  // Pattern: starts with digits followed by space(s), then text
  // but NOT if it contains % (that's a percentage format we want to keep)
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (match && !trimmed.includes("%")) {
    // Remove leading number: "2616 Polyester" -> "Polyester"
    return match[2].trim();
  }
  
  return trimmed;
}

export function buildCombinedProductName(
  parts: (string | null | undefined)[]
): string {
  return parts
    .filter((p) => p && p.trim())
    .map((p) => cleanCompositionName(p))
    .filter((p) => p)
    .join(" - ");
}
