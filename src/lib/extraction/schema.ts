import { z } from "zod";

const emptyToNull = (value: unknown) => value === "" ? null : value;

const nullableString = z.preprocess(emptyToNull, z.string().trim().nullable().optional());

const nullableNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().nullable().optional());

const partySchema = z.object({
  name: nullableString,
  address: nullableString,
  sc_number: nullableString,
  te_id: nullableString,
  license_no: nullableString,
  client_no: nullableString,
}).passthrough().nullable().optional();

export const extractedTcSchema = z.object({
  tc: z.object({
    tc_number: nullableString,
    version: nullableString,
    standard: nullableString,
    certification_body: nullableString,
    place_of_issue: nullableString,
    issue_date: nullableString,
    last_updated_date: nullableString,
    seller: partySchema,
    buyer: partySchema,
    gross_shipping_weight_kg: nullableNumber,
    net_shipping_weight_kg: nullableNumber,
    certified_weight_kg: nullableNumber,
    input_tcs: nullableString,
  }).passthrough().optional(),
  shipments: z.array(z.object({
    shipment_no: nullableString,
    shipment_date: nullableString,
    shipment_doc_no: nullableString,
    invoice_reference: nullableString,
    gross_shipping_weight_kg: nullableNumber,
    consignee_name: nullableString,
    consignee_address: nullableString,
    consignee_te_id: nullableString,
  }).passthrough()).optional().default([]),
  products: z.array(z.object({
    product_no: nullableString,
    shipment_no: nullableString,
    order_no: nullableString,
    article_no: nullableString,
    number_of_units: nullableNumber,
    unit_type: nullableString,
    net_shipping_weight_kg: nullableNumber,
    supplementary_weight_kg: nullableNumber,
    certified_weight_kg: nullableNumber,
    production_date: nullableString,
    product_category: nullableString,
    product_detail: nullableString,
    material_composition: nullableString,
    standard_label_grade: nullableString,
    additional_info_raw: nullableString,
    yarn_count_raw: nullableString,
    last_processor: nullableString,
    last_processor_te_id: nullableString,
    origin_country: nullableString,
    normalized_yarn_key: nullableString,
    normalization_confidence: nullableNumber,
    needs_manual_review: z.boolean().optional(),
  }).passthrough()).optional().default([]),
  raw_materials: z.array(z.object({
    material: nullableString,
    certified_weight_kg: nullableNumber,
    country_area: nullableString,
  }).passthrough()).optional().default([]),
  confidence: z.object({
    overall: nullableNumber,
    tc_number: nullableNumber,
    weights: nullableNumber,
    shipments: nullableNumber,
    products: nullableNumber,
  }).passthrough().optional(),
  warnings: z.array(z.string()).optional().default([]),
}).passthrough();

export type ExtractedTcSchema = z.infer<typeof extractedTcSchema>;
