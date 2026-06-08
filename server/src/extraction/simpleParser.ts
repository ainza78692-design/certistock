const TC_KEYWORDS = [
  "transaction certificate",
  "certified weight",
  "gross shipping",
  "net shipping",
  "shipment",
  "certified products",
  "product no",
  "yarn count",
  "idfl",
  "control union",
  "intertek",
];

export const LOCAL_TC_PARSER_MODE = "local_regex_first";
export const LOCAL_TC_PARSER_VERSION = "local_regex_2026_05_12_v4";

const numberFrom = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const firstMatch = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  }
  return null;
};

const sectionBetween = (text: string, start: RegExp, end: RegExp) => {
  const startMatch = start.exec(text);
  if (!startMatch) return "";
  const afterStart = text.slice(startMatch.index + startMatch[0].length);
  const endMatch = end.exec(afterStart);
  return (endMatch ? afterStart.slice(0, endMatch.index) : afterStart).trim();
};

const firstTeId = (text: string) =>
  firstMatch(text, [
    /(?:Textile Exchange-ID\s*\(TE-ID\)|Textile Exchange-ID|TE-ID)\s*[:\-]?\s*(TE-[A-Za-z0-9-]+)/i,
  ]);

const weightFromLabel = (text: string, label: string) =>
  numberFrom(firstMatch(text, [
    new RegExp(`${label}\\s*(?:\\([^)]+\\))?\\s*[:\\-]?\\s*(?:GRS(?:\\s*4\\.0)?\\s*[:\\-]?\\s*)?([\\d,]+(?:\\.\\d+)?)\\s*kg`, "i"),
  ]));

const cleanPartyName = (value?: string | null) => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+(?:Block No\.?|Plot No\.?|Village-|Post-|SC Number|Textile Exchange-ID|TE-ID|IDFL? Client No|Buying on behalf of|Selling on behalf of|License No\.?)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^J\.\s*Korin/i.test(cleaned)) return "J. Korin spinning Pvt Ltd";
  if (/^Reliance Industries Limited/i.test(cleaned)) return "Reliance Industries Limited";
  if (/^Alliance Fibres Private Limited/i.test(cleaned)) return "Alliance Fibres Private Limited";
  if (/^Yes Fashions/i.test(cleaned)) return "Yes Fashions Pvt Ltd";
  return cleaned || null;
};

const valueUntil = (label: string, stopLabels: string[]) =>
  new RegExp(`${label}\\s*[:\\-]?\\s*(.+?)(?:\\s+(?:${stopLabels.join("|")})\\s*[:\\-]?|$)`, "i");

const INPUT_TC_STOP_PATTERN =
  /\s+(?:Farm SCs?|Farm TCs?|Trader TCs?|9\.\s*Shipments|Shipment No\.?|10\.\s*Certified Products|Certified Products|Transaction Certificate Number|Place and Date of Issue|1\.\s*Certification Body|1\.\s*Certification\b)\b.*$/i;

export const normalizeInputTcs = (value?: string | null) => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(INPUT_TC_STOP_PATTERN, "")
    .replace(/[.;,\s]+$/, "")
    .trim();

  if (!cleaned) return null;
  if (/^(?:not\s+applicable|n\/?a|none|null|-)+$/i.test(cleaned)) return null;
  return cleaned;
};

const extractInputTcs = (text: string) => {
  const inputSection = sectionBetween(
    text,
    /8\.\s*Certified Input References\b/i,
    /(?:9\.\s*Shipments|10\.\s*Certified Products|11\.\s*Certified Raw Materials|12\.\s*Declarations|Transaction Certificate Number)\b/i,
  );

  const fromSection = firstMatch(inputSection, [
    /Input TCs?\s*[:\-]?\s*(.+?)(?:\s+(?:Farm SCs?|Farm TCs?|Trader TCs?)\b|$)/i,
  ]);
  const normalizedSectionValue = normalizeInputTcs(fromSection);
  if (normalizedSectionValue) return normalizedSectionValue;

  return normalizeInputTcs(firstMatch(text, [
    /Input TCs?\s*[:\-]?\s*(.+?)(?:\s+(?:Farm SCs?|Farm TCs?|Trader TCs?|9\.\s*Shipments|Shipment No\.?|10\.\s*Certified Products|Certified Products|Transaction Certificate Number|1\.\s*Certification Body|1\.\s*Certification\b)|$)/i,
  ]));
};

export function isGoodNativeText(text: string) {
  const normalized = text.toLowerCase();
  const keywordCount = TC_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length;
  return text.trim().length >= 1500 && keywordCount >= 2;
}

export function normalizeProductKey(raw: string) {
  const s = raw.toUpperCase();
  if (/\b0*50\s*\/\s*0*48\b|\b50\s*\/\s*48\b/.test(s)) return "50/48";
  if (/\b50\s*\/\s*45\b/.test(s)) return "50/45";
  if (/\b75\s*\/\s*72\b|SD7572ROTO|AFL99909/.test(s)) return "75/72";
  if (/\b150\s*\/\s*48\b|LBSRSD0138/.test(s)) return "150/48";
  if (/\b20\s*\/\s*1\b/.test(s)) return "20/1";
  if (/\b50\s*DENIER\b|\b50D\b|SD5048FDY|SD5048|AFL99906/.test(s)) return "50D";
  if (/\b70\s*DENIER\b|\b70D\b|\b70\s*\/\s*72\b|SD7072FDY|SD7072|LBSRSD0141/.test(s)) return "70D";
  if (/\b75\s*DENIER\b|\b75D\b/.test(s)) return "75D";
  if (/\b150\s*DENIER\b|\b150D\b|SD15048FDY|SD15048|AFL99916/.test(s)) return "150D";
  if (/\b30\s*DENIER\b|\b30D\b|3000SD/.test(s)) return "30D";
  return null;
}

export function parseSimpleTcExtraction(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const sellerSection = sectionBetween(
    compact,
    /2\.\s*Seller of Certified Products\s*/i,
    /3\.\s*Buyer of Certified Products/i,
  );
  const buyerSection = sectionBetween(
    compact,
    /3\.\s*Buyer of Certified Products\s*/i,
    /4\.\s*Gross Shipping Weight/i,
  );
  const tcNumber = firstMatch(compact, [
    /Transaction Certificate Number\s*[:\-]?\s*([A-Z]{2,4}(?:-[A-Z]+)*[- ]?[A-Z]?[- ]?\d{2,7}[- ]?\d{4,8})/i,
    /\b((?:IDF|IDFL|CUI|ITS)(?:-[A-Z]+)*[- ]?[A-Z]?[- ]?\d{2,7}[- ]?\d{4,8})\b/i,
  ]);

  const gross = weightFromLabel(compact, "Gross Shipping Weight");
  const net = weightFromLabel(compact, "Net Shipping Weight");
  const certified = weightFromLabel(compact, "Certified Weight");
  const issueDate = firstMatch(compact, [
    /Place and Date of Issue(?:.*?\b)?([0-9]{4}-[0-9]{2}-[0-9]{2})\b/i,
    /\bDate of Issue\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\b/i,
  ]);

  const supplierName = cleanPartyName(firstMatch(compact, [
    /(?:Seller of Certified Products?|Supplier)\s*[:\-]?\s*(.+?)(?:\s+(?:Buyer|Gross Shipping Weight|Net Shipping Weight|Certified Weight|Transaction Certificate Number)\b)/i,
  ]));
  const buyerName = cleanPartyName(firstMatch(compact, [
    /Buyer(?: of Certified Products?)?\s*[:\-]?\s*(.+?)(?:\s+(?:Gross Shipping Weight|Net Shipping Weight|Certified Weight|Shipment|Certified Products)\b)/i,
  ]));
  const inputTcs = extractInputTcs(compact);

  const shipmentMatches = [...compact.matchAll(/Shipment No\.?\s*[:\-]?\s*([A-Za-z0-9/-]+)(.*?)(?=Shipment No\.?\s*[:\-]?\s*[A-Za-z0-9/-]+|10\.?\s*Certified Products|Certified Products\s+Product No\.?|Product No\.?|$)/gi)];
  const shipments = shipmentMatches.map((match) => {
    const block = match[0];
    return {
      shipment_no: match[1],
      shipment_date: firstMatch(block, [/Shipment Date\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i]),
      shipment_doc_no: firstMatch(block, [/Shipment Doc No\.?\s*[:\-]?\s*(.+?)(?:\s+Gross Shipping Weight\b|$)/i]),
      invoice_reference: firstMatch(block, [/Invoice References?\s*[:\-]?\s*(.+?)(?:\s+Shipment No\.?|\s+Transaction Certificate Number|\s+10\.?\s*Certified Products|$)/i]),
      gross_shipping_weight_kg: weightFromLabel(block, "Gross Shipping Weight"),
      consignee_name: cleanPartyName(firstMatch(block, [/Consignee Name and Address\s*[:\-]?\s*(.+?)(?:\s+TE-ID\b|\s+Invoice References?\b|$)/i])),
      consignee_te_id: firstMatch(block, [/TE-ID\s*[:\-]?\s*(TE-[A-Za-z0-9-]+)/i]),
    };
  }).filter((shipment) => shipment.shipment_date);

  const productMatches = [...compact.matchAll(/(?:Shipment\/Product No\.?|(?<!Shipment\/)Product No\.?)\s*[:\-]?\s*([A-Za-z0-9/-]+)(.*?)(?=(?:Shipment\/Product No\.?|(?<!Shipment\/)Product No\.?)|Raw Materials?|$)/gi)];
  const products = productMatches.map((match) => {
    const block = match[0];
    const productStopLabels = [
      "Order No\\.?",
      "Article No\\.?",
      "Number of Units",
      "Net Shipping Weight",
      "Supplementary Weight",
      "Certified Weight",
      "Production Date",
      "Product Category",
      "Product Detail",
      "Material Composition",
      "Standard \\(Label Grade\\)",
      "Additional Info",
      "Last Processor",
      "Transaction Certificate Number",
      "Product No\\.?",
    ];
    const article = firstMatch(block, [/Article No\.?\s*[:\-]?\s*([A-Za-z0-9/-]+)/i]);
    const yarn = firstMatch(block, [/Yarn count\s*[:\-]?\s*(.+?)(?:\s+(?:Last Processor|Production Date|Net Shipping Weight|Certified Weight|Transaction Certificate Number|Product No\.?)\b|$)/i]);
    const additional = yarn || firstMatch(block, [/Additional Info\s*[:\-]?\s*(.+?)(?:\s+(?:Last Processor|Production Date|Net Shipping Weight|Certified Weight|Transaction Certificate Number|Product No\.?)\b|$)/i]);
    const productCategory = firstMatch(block, [valueUntil("Product Category", productStopLabels)]);
    const productDetail = firstMatch(block, [valueUntil("Product Detail", productStopLabels)]);
    const materialComposition = firstMatch(block, [valueUntil("Material Composition", productStopLabels)]);
    const standardLabelGrade = firstMatch(block, [valueUntil("Standard \\(Label Grade\\)", productStopLabels)]);
    const search = [block, article, yarn, additional, productCategory, productDetail].filter(Boolean).join(" ");
    const normalized = normalizeProductKey(search);
    const inlineShipmentProductNo = firstMatch(block, [/Product No\.?\s*[:\-]?\s*([A-Za-z0-9-]+)\s*\/\s*[A-Za-z0-9-]+/i]);
    return {
      product_no: match[1],
      shipment_no: firstMatch(block, [
        /Shipment\/Product No\.?\s*[:\-]?\s*([A-Za-z0-9-]+)\s*\/\s*[A-Za-z0-9-]+/i,
        /Shipment(?:\/Product)? No\.?\s*[:\-]?\s*([A-Za-z0-9/-]+)/i,
      ]) || inlineShipmentProductNo,
      order_no: firstMatch(block, [valueUntil("Order No\\.?", productStopLabels)]),
      article_no: article,
      additional_info_raw: additional,
      yarn_count_raw: yarn,
      number_of_units: numberFrom(firstMatch(block, [/Number of Units\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i])),
      unit_type: firstMatch(block, [/Number of Units\s*[:\-]?\s*[\d,]+(?:\.\d+)?\s*([A-Za-z]+)/i]),
      net_shipping_weight_kg: weightFromLabel(block, "Net Shipping Weight"),
      certified_weight_kg: weightFromLabel(block, "Certified Weight"),
      production_date: firstMatch(block, [/Production Date\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i]),
      product_category: productCategory,
      product_detail: productDetail,
      material_composition: materialComposition,
      standard_label_grade: standardLabelGrade,
      last_processor: firstMatch(block, [/Last Processor\s*[:\-]?\s*(.+?)(?:\s+-\s+TE-ID\b|\s+TE-ID\b|\s+Country\/Area\b|$)/i]),
      origin_country: firstMatch(block, [/Country\/Area\s*[:\-]?\s*([A-Za-z ]+?)(?:\s+Product No\.?|$)/i]),
      normalized_yarn_key: normalized,
      needs_manual_review: !normalized,
    };
  }).filter((product) => product.article_no || product.certified_weight_kg || product.net_shipping_weight_kg);

  if (shipments.length === products.length && products.some((product) => !product.shipment_no)) {
    products.forEach((product, index) => {
      if (!product.shipment_no) product.shipment_no = shipments[index]?.shipment_no || null;
    });
  }

  const warnings: string[] = [];
  if (!tcNumber) warnings.push("TC number missing");
  if (!certified) warnings.push("Certified weight missing");
  if (!products.length) warnings.push("No product lines detected");

  const score = Math.max(35, 100 - warnings.length * 18 - products.filter((p) => !p.normalized_yarn_key).length * 5);

  return {
    tc_number: tcNumber,
    standard: compact.includes("GRS") ? "GRS" : null,
    supplier_name: supplierName,
    supplier_te_id: firstTeId(sellerSection),
    buyer_name: buyerName,
    buyer_te_id: firstTeId(buyerSection),
    issue_date: issueDate,
    gross_shipping_weight_kg: gross,
    net_shipping_weight_kg: net,
    certified_weight_kg: certified,
    input_tcs: inputTcs,
    shipments,
    products,
    raw_materials: [],
    warnings,
    confidence: { overall: score },
    _parser_mode: LOCAL_TC_PARSER_MODE,
    _parser_version: LOCAL_TC_PARSER_VERSION,
    _extracted_at: new Date().toISOString(),
    _confidence: score,
    _review_flags: warnings,
  };
}
