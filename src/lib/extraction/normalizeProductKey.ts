export type ProductNormalizationInput = {
  additionalInfoRaw?: string | null;
  yarnCountRaw?: string | null;
  articleNo?: string | null;
  productCategory?: string | null;
  productDetail?: string | null;
};

export type ProductNormalizationResult = {
  normalizedKey: string | null;
  matchedAlias: string | null;
  confidence: number;
  needsManualReview: boolean;
  aliasSearchKey?: string | null;
};

const clean = (value?: string | null) => (value || "").toUpperCase().replace(/[^A-Z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();

export const buildProductSearchText = (input: ProductNormalizationInput) => clean([
  input.additionalInfoRaw,
  input.yarnCountRaw,
  input.articleNo,
  input.productCategory,
  input.productDetail,
].filter(Boolean).join(" "));

const match = (text: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

export const normalizeProductKeyDetailed = (input: ProductNormalizationInput): ProductNormalizationResult => {
  const text = buildProductSearchText(input);

  if (match(text, [/\b0*50\s*\/\s*0*48\b/, /\b50\s*\/\s*48\b/])) {
    return { normalizedKey: "50/48", matchedAlias: "50/48", confidence: 0.97, needsManualReview: false, aliasSearchKey: "50D" };
  }
  if (match(text, [/\b50\s*\/\s*45\b/])) {
    return { normalizedKey: "50/45", matchedAlias: "50/45", confidence: 0.97, needsManualReview: false, aliasSearchKey: "50D" };
  }
  if (match(text, [/\b75\s*\/\s*72\b/, /SD7572ROTO/, /AFL99909/])) {
    return { normalizedKey: "75/72", matchedAlias: "75/72", confidence: 0.97, needsManualReview: false };
  }
  if (match(text, [/\b150\s*\/\s*48\b/, /LBSRSD0138/])) {
    return { normalizedKey: "150/48", matchedAlias: "150/48", confidence: 0.97, needsManualReview: false };
  }
  if (match(text, [/\b20\s*\/\s*1\b/])) {
    return { normalizedKey: "20/1", matchedAlias: "20/1", confidence: 0.97, needsManualReview: false };
  }
  if (match(text, [/\b50\s*DENIER\b/, /\b50D\b/, /SD5048FDY/, /SD5048/, /AFL99906/])) {
    return { normalizedKey: "50D", matchedAlias: "50D", confidence: 0.96, needsManualReview: false };
  }
  if (match(text, [/\b70\s*DENIER\b/, /\b70D\b/, /\b70\s*\/\s*72\b/, /SD7072FDY/, /SD7072/, /LBSRSD0141/])) {
    return { normalizedKey: "70D", matchedAlias: "70D", confidence: 0.96, needsManualReview: false };
  }
  if (match(text, [/\b75\s*DENIER\b/, /\b75D\b/])) {
    return { normalizedKey: "75D", matchedAlias: "75D", confidence: 0.94, needsManualReview: false };
  }
  if (match(text, [/\b150\s*DENIER\b/, /\b150D\b/, /SD15048FDY/, /SD15048/, /AFL99916/])) {
    return { normalizedKey: "150D", matchedAlias: "150D", confidence: 0.96, needsManualReview: false };
  }
  if (match(text, [/\b30\s*DENIER\b/, /\b30D\b/, /3000SD/])) {
    return { normalizedKey: "30D", matchedAlias: "30D", confidence: 0.96, needsManualReview: false };
  }

  return { normalizedKey: null, matchedAlias: null, confidence: 0, needsManualReview: true, aliasSearchKey: null };
};

export const normalizeProductKey = (raw?: string | null, article?: string | null) =>
  normalizeProductKeyDetailed({ additionalInfoRaw: raw, articleNo: article }).normalizedKey;
