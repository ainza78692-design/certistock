export function cleanCompositionName(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.replace(/^\d{3,}(?:\s+|[-:]\s+)(?=\S)/, "").trim();
}

