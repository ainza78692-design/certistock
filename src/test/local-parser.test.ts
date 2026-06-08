import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { normalizeProductKey, parseSimpleTcExtraction } from "../../server/src/extraction/simpleParser";

const parseReferencePdf = async (fileName: string) => {
  const bytes = readFileSync(join(process.cwd(), "tcs and references", fileName));
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return parseSimpleTcExtraction(text || "") as any;
};

const hasReferencePdfs = [
  "IDF-25-790768.pdf",
  "IDF-25-792887.pdf",
  "IDF-26-962415.pdf",
  "CUI-04657076 J Korin.pdf",
  "ITS-GRS-C-0154573 RIL.pdf",
].every((fileName) => existsSync(join(process.cwd(), "tcs and references", fileName)));

describe("local regex TC parser", () => {
  it("normalizes known article and yarn patterns without stale key drift", () => {
    expect(normalizeProductKey("150 DENIER SD DRAW YARN SD15048FDY")).toBe("150D");
    expect(normalizeProductKey("50 DENIER SD DRWY YARN SD5048FDY")).toBe("50D");
    expect(normalizeProductKey("See associated TC. Yarn count: 50/45 RSD RFDY LBSRSD0140")).toBe("50/45");
    expect(normalizeProductKey("See associated TC. Yarn count: 70/72 RSD RFDY LBSRSD0141")).toBe("70D");
  });

  it("adds parser metadata to extraction output", () => {
    const parsed = parseSimpleTcExtraction(`
      Transaction Certificate Number IDF-25-790768
      Gross Shipping Weight 42,989.71 kg
      Net Shipping Weight 40,396.36 kg
      Certified Weight GRS 40,396.36 kg
      Shipment No: 1 Shipment Date: 2025-04-03 Gross Shipping Weight: 6525.98 kg
      Product No: 1 Shipment/Product No: 1 / 1 Article No: SD15048FDY Number of Units: 148 BOX
      Net Shipping Weight: 6525.98 kg Certified Weight: 6525.98 kg Additional Info: 150 DENIER SD DRAW YARN.
    `) as any;

    expect(parsed._parser_mode).toBe("local_regex_first");
    expect(parsed._parser_version).toBe("local_regex_2026_05_12_v4");
    expect(parsed.products).toHaveLength(1);
    expect(parsed.products[0].normalized_yarn_key).toBe("150D");
  });

  it("extracts supplier TE-ID and input TC references from IDFL header text", () => {
    const parsed = parseSimpleTcExtraction(`
      Input TCs:
      Not Applicable
      1. Certification Body
      IDFL Laboratory and Institute
      2. Seller of Certified Products
      Alliance Fibres Private Limited
      Textile Exchange-ID (TE-ID): TE-99952549
      IDFL Client No: 010708
      3. Buyer of Certified Products
      YES FASHIONS PVT LTD
      TE-ID: TE-00052592
      4. Gross Shipping Weight
      48,988.04 kg
      5. Net Shipping Weight
      46,056.10 kg
      6. Certified Weight
      (GRS): 46,056.10 kg
      8. Certified Input References
      Transaction Certificate Number IDF-26-962415, version 1
    `) as any;

    expect(parsed.supplier_te_id).toBe("TE-99952549");
    expect(parsed.buyer_te_id).toBe("TE-00052592");
    expect(parsed.input_tcs).toBeNull();
  });

  (hasReferencePdfs ? it : it.skip)("extracts only meaningful input TC references from reference PDFs", async () => {
    await expect(parseReferencePdf("IDF-25-790768.pdf").then((parsed) => parsed.input_tcs)).resolves.toBeNull();
    await expect(parseReferencePdf("IDF-25-792887.pdf").then((parsed) => parsed.input_tcs)).resolves.toBeNull();
    await expect(parseReferencePdf("IDF-26-962415.pdf").then((parsed) => parsed.input_tcs)).resolves.toBeNull();
    await expect(parseReferencePdf("CUI-04657076 J Korin.pdf").then((parsed) => parsed.input_tcs)).resolves.toBe("25-921120; IDF-25-920859");
    await expect(parseReferencePdf("ITS-GRS-C-0154573 RIL.pdf").then((parsed) => parsed.input_tcs)).resolves.toBe("816491/01826821");
  });
});
