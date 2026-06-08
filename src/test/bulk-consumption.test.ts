import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { calculateOutwardCertifiedWeight } from "@/hooks/useBulkConsumption";
import { findLotByTcShipment } from "@/lib/bulkConsumptionMatching";
import { parseSaledumpFile } from "@/lib/parseSaledump";

describe("bulk saledump consumption", () => {
  const saledumpTesting4 = path.join(process.cwd(), "excel-references", "saledumptesing4.xls");
  const saledumpBoth = path.join(process.cwd(), "excel-references", "saledumpBOTH.xls");

  (existsSync(saledumpTesting4) ? it : it.skip)("parses Excel Sheet columns as shipment numbers", async () => {
    const filePath = saledumpTesting4;
    const bytes = readFileSync(filePath);
    const file = {
      name: "saledumptesing4.xls",
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    } as File;

    const parsed = await parseSaledumpFile(file);
    expect(parsed.format).toBe("A");
    expect(parsed.rows[0].tcEntries[0]).toMatchObject({
      shipmentNo: "3",
      sheetRef: 3,
      consumedWeightKg: 100,
    });
    expect(parsed.rows[0].tcEntries[0].tcNumber).toMatch(/IDF-\d{2}-\d+/);
    expect(parsed.rows[0].tcEntries[1]).toMatchObject({
      shipmentNo: "4",
      sheetRef: 4,
      consumedWeightKg: 30,
    });
    expect(parsed.rows[0].tcEntries[1].tcNumber).toMatch(/CUI-\d+/);
  });

  (existsSync(saledumpBoth) ? it : it.skip)("parses saledumpBOTH loss into the TC entry", async () => {
    const filePath = saledumpBoth;
    const bytes = readFileSync(filePath);
    const file = {
      name: "saledumpBOTH.xls",
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    } as File;

    const parsed = await parseSaledumpFile(file);
    expect(["A", "B"]).toContain(parsed.format);
    expect(parsed.rows[0].tcEntries.length).toBeGreaterThan(0);
    expect(parsed.rows[0].tcEntries[0]).toMatchObject({
      certBody: "Idfl",
      shipmentNo: "6",
      sheetRef: 6,
      consumedWeightKg: 500,
      lossPercent: 2.1,
    });
    expect(calculateOutwardCertifiedWeight(
      parsed.rows[0].tcEntries[0].consumedWeightKg,
      parsed.rows[0].tcEntries[0].lossPercent,
    )).toBe(489.5);
    if (parsed.format === "A") {
      expect(parsed.rows[0].tcEntries[1]).toMatchObject({
        certBody: "Non",
        tcNumber: "CUI-04657076",
        shipmentNo: "10",
        sheetRef: 10,
        consumedWeightKg: 220,
        lossPercent: 2.1,
      });
      expect(calculateOutwardCertifiedWeight(
        parsed.rows[0].tcEntries[1].consumedWeightKg,
        parsed.rows[0].tcEntries[1].lossPercent,
      )).toBe(215.38);
    }
  });

  it("parses dual TC saledumps with a Loss column after each C.wt", async () => {
    const header = Array(35).fill("");
    header[0] = "Invoice No.";
    header[7] = "Buyer Name";
    header[12] = "Composition";
    header[13] = "Count";
    header[17] = "C.Wt.";
    header[18] = "GR.Wt.";
    header[19] = "Nt.Wt.";
    header[24] = "Recy";
    header[25] = "IDFL / Non IDFL";
    header[26] = "TC Number";
    header[27] = "Sheet";
    header[28] = "C.wt";
    header[29] = "Loss";
    header[30] = "IDFL / Non IDFL";
    header[31] = "Tc number";
    header[32] = "Sheet";
    header[33] = "C.wt";
    header[34] = "Loss";

    const row = Array(35).fill("");
    row[0] = "GC01840/25";
    row[7] = "ALPINE EXPO TEX PRIVATE LIMITED";
    row[12] = "2616 65% RECYCLE POLYESTER DYED FABRIC";
    row[13] = "80D X 40S";
    row[25] = "Idfl";
    row[26] = "25-790768";
    row[27] = 6;
    row[28] = 500;
    row[29] = 2.1;
    row[30] = "Non";
    row[31] = "CUI-04657076";
    row[32] = 10;
    row[33] = 220;
    row[34] = 2.1;

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = {
      name: "dual-tc-loss.xlsx",
      arrayBuffer: async () => bytes,
    } as File;

    const parsed = await parseSaledumpFile(file);
    expect(parsed.format).toBe("A");
    expect(parsed.rows[0].tcEntries).toHaveLength(2);
    expect(parsed.rows[0].tcEntries[1]).toMatchObject({
      certBody: "Non",
      tcNumber: "CUI-04657076",
      shipmentNo: "10",
      sheetRef: 10,
      consumedWeightKg: 220,
      lossPercent: 2.1,
    });
    expect(calculateOutwardCertifiedWeight(
      parsed.rows[0].tcEntries[1].consumedWeightKg,
      parsed.rows[0].tcEntries[1].lossPercent,
    )).toBe(215.38);
  });

  it("attaches Format B row loss to the single TC entry", async () => {
    const header = Array(30).fill("");
    header[0] = "Invoice No.";
    header[1] = "Invoice Date";
    header[7] = "Buyer Name";
    header[12] = "Composition";
    header[13] = "Count";
    header[17] = "C.Wt.";
    header[18] = "GR.Wt.";
    header[19] = "Nt.Wt.";
    header[24] = "Recy%";
    header[25] = "IDFL / Non IDFL";
    header[26] = "TC Number";
    header[27] = "Sheet";
    header[28] = "C.wt";
    header[29] = "Loss";

    const row = Array(30).fill("");
    row[0] = "GC01840/25";
    row[7] = "ALPINE EXPO TEX PRIVATE LIMITED";
    row[12] = "2616 65% RECYCLE POLYESTER DYED FABRIC";
    row[13] = "70D";
    row[17] = 500;
    row[18] = 216.05;
    row[19] = 211.61;
    row[25] = "Idfl";
    row[26] = "IDF-25-790768";
    row[27] = 6;
    row[28] = 500;
    row[29] = 2.1;

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = {
      name: "single-tc-loss.xlsx",
      arrayBuffer: async () => bytes,
    } as File;

    const parsed = await parseSaledumpFile(file);
    expect(parsed.format).toBe("B");
    expect(parsed.rows[0].lossPercent).toBe(2.1);
    expect(parsed.rows[0].tcEntries[0]).toMatchObject({
      tcNumber: "IDF-25-790768",
      shipmentNo: "6",
      consumedWeightKg: 500,
      lossPercent: 2.1,
    });
  });

  it("calculates outward certified weight from Excel loss", () => {
    expect(calculateOutwardCertifiedWeight(220, 2.1)).toBe(215.38);
    expect(calculateOutwardCertifiedWeight(220, null)).toBe(220);
    expect(calculateOutwardCertifiedWeight(220, undefined)).toBe(220);
  });

  it("matches by TC number and shipment number instead of positional lot index", () => {
    const lots = [
      {
        id: "wrong-positional-lot",
        normalized_yarn_key: "30D",
        remaining_stock_kg: 500,
        transaction_certificates: { tc_number: "IDF-25-888845" },
        shipments: { shipment_no: "1", shipment_date: "2025-01-01" },
      },
      {
        id: "expected-shipment-lot",
        normalized_yarn_key: "50D",
        remaining_stock_kg: 500,
        transaction_certificates: { tc_number: "IDF-25-888845" },
        shipments: { shipment_no: "3", shipment_date: "2025-01-03" },
      },
    ];

    const match = findLotByTcShipment({
      lots,
      tcNumber: "IDF-25-888845",
      shipmentNo: 3,
      yarnKey: "80D",
      neededKg: 100,
    });

    expect(match.kind).toBe("matched");
    if (match.kind === "matched") {
      expect(match.lot.id).toBe("expected-shipment-lot");
      expect(match.lot.normalized_yarn_key).toBe("50D");
    }
  });

  it("marks TC and shipment matches ambiguous when yarn cannot disambiguate multiple lots", () => {
    const lots = [
      {
        id: "lot-a",
        normalized_yarn_key: "50D",
        remaining_stock_kg: 500,
        transaction_certificates: { tc_number: "CUI-04657076" },
        shipments: { shipment_no: "4", shipment_date: "2025-01-04" },
      },
      {
        id: "lot-b",
        normalized_yarn_key: "70D",
        remaining_stock_kg: 500,
        transaction_certificates: { tc_number: "CUI-04657076" },
        shipments: { shipment_no: "4", shipment_date: "2025-01-04" },
      },
    ];

    const match = findLotByTcShipment({
      lots,
      tcNumber: "CUI-04657076",
      shipmentNo: 4,
      yarnKey: "80D",
      neededKg: 30,
    });

    expect(match.kind).toBe("ambiguous");
  });
});
