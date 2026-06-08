import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import { buildBulkLotLabel, findLotByTcShipment } from "@/lib/bulkConsumptionMatching";
import { parseSaledumpFile, ParsedSaledump, SaledumpRow, TcConsumptionTarget } from "@/lib/parseSaledump";

export type MatchStatus = "matched" | "partial" | "ambiguous" | "unmatched" | "duplicate" | "skipped" | "done" | "error";

export interface ConsumptionLine {
  id: string;
  sourceRow: SaledumpRow;
  tcEntry: TcConsumptionTarget | null;
  consumedWeightKg: number;
  lossPercent: number | null;
  outwardCertifiedWeightKg: number;
  lotId: string | null;
  lotLabel: string;
  lotRemaining: number;
  customerId: string | null;
  customerName: string;
  status: MatchStatus;
  errorMsg: string;
  invoiceNo: string;
  invoiceDate: string | null;
  netWeightKg: number | null;
  grossWeightKg: number | null;
  ewayBillNo: string;
}

export type BulkStep = "upload" | "review" | "processing" | "done";

export function calculateOutwardCertifiedWeight(consumedWeightKg: number, lossPercent?: number | null): number {
  const consumed = Number(consumedWeightKg);
  const loss = Number(lossPercent);
  if (!Number.isFinite(consumed) || consumed <= 0) return 0;
  if (!Number.isFinite(loss) || loss < 0 || loss > 100) return Number(consumed.toFixed(3));
  return Number((consumed * (1 - loss / 100)).toFixed(3));
}

export function useBulkConsumption() {
  const { profile } = useAuth();
  const cid = profile?.company_id;

  const [step, setStep] = useState<BulkStep>("upload");
  const [parsed, setParsed] = useState<ParsedSaledump | null>(null);
  const [lines, setLines] = useState<ConsumptionLine[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  const { data: lots } = useQuery({
    queryKey: ["bulk-lots", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) {
        const data = await localApi<any[]>("/api/stock-lots");
        return data
          .filter((lot) => lot.status === "active" && Number(lot.remaining_stock_kg || 0) > 0)
          .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
      }

      const { data } = await supabase.from("product_lots")
        .select("id, created_at, normalized_yarn_key, article_no, remaining_stock_kg, certified_weight_kg, additional_info_raw, status, transaction_certificates(tc_number), shipments(shipment_no, shipment_date)")
        .eq("company_id", cid!)
        .eq("status", "active")
        .gt("remaining_stock_kg", 0)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["bulk-customers", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) {
        const data = await localApi<any[]>("/api/customers");
        return data.map((customer: any) => ({
          ...customer,
          customer_name: customer.customer_name || customer.name,
        }));
      }

      const { data } = await supabase.from("customers").select("id, customer_name").eq("company_id", cid!).order("customer_name");
      return data || [];
    },
  });

  const { data: existingInvoices } = useQuery({
    queryKey: ["bulk-invoices", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) {
        const data = await localApi<any[]>("/api/outward-sales");
        return new Set((data || []).map((d: any) => d.outward_invoice_no?.trim().toUpperCase()).filter(Boolean));
      }

      const { data } = await supabase.from("outward_sales").select("outward_invoice_no").eq("company_id", cid!);
      return new Set((data || []).map((d: any) => d.outward_invoice_no?.trim().toUpperCase()).filter(Boolean));
    },
  });

  const findLotByTc = useCallback((tcNumber: string, shipmentNo: string | number | null, yarnKey: string | null, neededKg: number) => {
    return findLotByTcShipment({ lots: lots as any, tcNumber, shipmentNo, yarnKey, neededKg });
  }, [lots]);

  const findLotByYarnKey = useCallback((yarnKey: string | null, neededKg: number) => {
    if (!lots || !yarnKey) return null;
    return lots.find((l: any) => l.normalized_yarn_key === yarnKey && l.remaining_stock_kg >= neededKg) || null;
  }, [lots]);

  const findCustomer = useCallback((buyerName: string) => {
    if (!customers || !buyerName) return null;
    const clean = buyerName.toUpperCase().trim();
    let match = customers.find((c: any) => c.customer_name.toUpperCase().trim() === clean);
    if (match) return match;
    match = customers.find((c: any) => clean.includes(c.customer_name.toUpperCase().trim()) || c.customer_name.toUpperCase().trim().includes(clean));
    return match || null;
  }, [customers]);

  const handleFile = useCallback(async (file: File) => {
    const result = await parseSaledumpFile(file);
    setParsed(result);

    const newLines: ConsumptionLine[] = [];
    let lineId = 0;

    for (const row of result.rows) {
      const isDuplicate = existingInvoices?.has(row.invoiceNo.trim().toUpperCase()) || false;
      const custMatch = findCustomer(row.buyerName);

      if (row.tcEntries.length > 0) {
        for (const tc of row.tcEntries) {
          const shipmentNo = tc.shipmentNo ?? tc.sheetRef;
          const match = findLotByTc(tc.tcNumber, shipmentNo, row.normalizedYarnKey, tc.consumedWeightKg);
          const lot = match.kind === "matched" || match.kind === "partial" ? match.lot as any : null;
          const lotOk = match.kind === "matched";
          const lossPercent = Number.isFinite(Number(tc.lossPercent))
            ? Number(tc.lossPercent)
            : Number.isFinite(Number(row.lossPercent))
              ? Number(row.lossPercent)
              : null;
          const outwardCertifiedWeightKg = calculateOutwardCertifiedWeight(tc.consumedWeightKg, lossPercent);

          newLines.push({
            id: `line-${lineId++}`,
            sourceRow: row,
            tcEntry: tc,
            consumedWeightKg: tc.consumedWeightKg,
            lossPercent,
            outwardCertifiedWeightKg,
            lotId: lot?.id || null,
            lotLabel: buildBulkLotLabel(lot),
            lotRemaining: lot?.remaining_stock_kg || 0,
            customerId: custMatch?.id || null,
            customerName: custMatch?.customer_name || row.buyerName,
            status: isDuplicate ? "duplicate" : (match.kind === "ambiguous" ? "ambiguous" : lot && lotOk ? "matched" : lot ? "partial" : "unmatched"),
            errorMsg: isDuplicate
              ? "Invoice already processed"
              : match.kind === "ambiguous"
                ? `Multiple lots found for TC ${tc.tcNumber}, shipment ${shipmentNo}. Select the correct lot.`
                : !lot
                  ? `No matching lot found for TC ${tc.tcNumber}${shipmentNo ? `, shipment ${shipmentNo}` : ""}`
                  : !lotOk ? "Lot has insufficient stock" : "",
            invoiceNo: row.invoiceNo,
            invoiceDate: row.invoiceDate,
            netWeightKg: row.netWeightKg,
            grossWeightKg: row.grossWeightKg,
            ewayBillNo: row.ewayBillNo,
          });
        }
      } else {
        const wt = row.certWeightKg || 0;
        const lot = findLotByYarnKey(row.normalizedYarnKey, wt) as any;
        const lotOk = lot && lot.remaining_stock_kg >= wt;
        newLines.push({
          id: `line-${lineId++}`,
          sourceRow: row,
          tcEntry: null,
          consumedWeightKg: wt,
          lossPercent: null,
          outwardCertifiedWeightKg: calculateOutwardCertifiedWeight(wt, null),
          lotId: lot?.id || null,
          lotLabel: buildBulkLotLabel(lot),
          lotRemaining: lot?.remaining_stock_kg || 0,
          customerId: custMatch?.id || null,
          customerName: custMatch?.customer_name || row.buyerName,
          status: isDuplicate ? "duplicate" : (lot && lotOk ? "matched" : lot ? "partial" : "unmatched"),
          errorMsg: isDuplicate ? "Invoice already processed" : (!lot ? `No lot found for ${row.normalizedYarnKey || row.count}` : (!lotOk ? "Lot has insufficient stock" : "")),
          invoiceNo: row.invoiceNo,
          invoiceDate: row.invoiceDate,
          netWeightKg: row.netWeightKg,
          grossWeightKg: row.grossWeightKg,
          ewayBillNo: row.ewayBillNo,
        });
      }
    }

    setLines(newLines);
    setStep("review");
  }, [existingInvoices, findCustomer, findLotByTc, findLotByYarnKey]);

  const toggleSkip = useCallback((lineId: string) => {
    setLines(prev => prev.map(l => l.id === lineId
      ? { ...l, status: l.status === "skipped" ? (l.lotId ? "matched" : "unmatched") : "skipped" }
      : l
    ));
  }, []);

  const updateLot = useCallback((lineId: string, lotId: string) => {
    if (!lots) return;
    const lot = lots.find((l: any) => l.id === lotId) as any;
    if (!lot) return;
    setLines(prev => prev.map(l => l.id === lineId ? {
      ...l,
      lotId: lot.id,
      lotLabel: buildBulkLotLabel(lot),
      lotRemaining: lot.remaining_stock_kg,
      status: lot.remaining_stock_kg >= l.consumedWeightKg ? "matched" : "partial",
      errorMsg: lot.remaining_stock_kg < l.consumedWeightKg ? "Lot has insufficient stock" : "",
    } : l));
  }, [lots]);

  const updateWeight = useCallback((lineId: string, weight: number) => {
    setLines(prev => prev.map(l => l.id === lineId ? {
      ...l,
      consumedWeightKg: weight,
      outwardCertifiedWeightKg: calculateOutwardCertifiedWeight(weight, l.lossPercent),
      status: l.lotId && l.lotRemaining >= weight ? "matched" : l.status,
      errorMsg: l.lotId && l.lotRemaining < weight ? "Lot has insufficient stock" : l.errorMsg,
    } : l));
  }, []);

  const processAll = useCallback(async () => {
    setStep("processing");
    setProcessing(true);
    setProcessedCount(0);

    const toProcess = lines.filter(l => l.status === "matched" && l.lotId);

    for (let i = 0; i < toProcess.length; i++) {
      const line = toProcess[i];
      try {
        if (isLocalBackend) {
          const data = await localApi<{ ok?: boolean; error?: string }>("/api/consumption", {
            method: "POST",
            body: JSON.stringify({
              productLotId: line.lotId,
              customerId: line.customerId || null,
              newCustomer: !line.customerId ? line.customerName : null,
              consumedWeightKg: line.consumedWeightKg,
              consumptionDate: line.invoiceDate || null,
              remarks: `Bulk import: ${line.invoiceNo}${line.tcEntry ? " - TC " + line.tcEntry.tcNumber : ""}`,
              outwardSale: {
                outward_invoice_no: line.invoiceNo || null,
                outward_invoice_date: line.invoiceDate || null,
                outward_net_weight_kg: line.netWeightKg || null,
                outward_gross_weight_kg: line.grossWeightKg || null,
                outward_certified_weight_kg: line.outwardCertifiedWeightKg,
                transport_doc_no: line.ewayBillNo || null,
                destination: line.sourceRow.consigneeName || null,
                product_name: line.sourceRow.composition || null,
                normalized_yarn_key: line.sourceRow.normalizedYarnKey || null,
              },
            }),
          });
          if (!data?.ok) throw new Error(data?.error || "Failed");
          setLines(prev => prev.map(l => l.id === line.id ? { ...l, status: "done" as MatchStatus, errorMsg: "" } : l));
          setProcessedCount(i + 1);
          if (i < toProcess.length - 1) await new Promise(r => setTimeout(r, 300));
          continue;
        }

        const { data, error } = await supabase.functions.invoke("record-consumption", {
          body: {
            productLotId: line.lotId,
            customerId: line.customerId || null,
            newCustomer: !line.customerId ? line.customerName : null,
            consumedWeightKg: line.consumedWeightKg,
            consumptionDate: line.invoiceDate || null,
            remarks: `Bulk import: ${line.invoiceNo}${line.tcEntry ? " - TC " + line.tcEntry.tcNumber : ""}`,
            outwardSale: {
              outward_invoice_no: line.invoiceNo || null,
              outward_invoice_date: line.invoiceDate || null,
              outward_net_weight_kg: line.netWeightKg || null,
              outward_gross_weight_kg: line.grossWeightKg || null,
              outward_certified_weight_kg: line.outwardCertifiedWeightKg,
              transport_doc_no: line.ewayBillNo || null,
              destination: line.sourceRow.consigneeName || null,
              product_name: line.sourceRow.composition || null,
              normalized_yarn_key: line.sourceRow.normalizedYarnKey || null,
            },
          },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Failed");
        setLines(prev => prev.map(l => l.id === line.id ? { ...l, status: "done" as MatchStatus, errorMsg: "" } : l));
      } catch (err: any) {
        setLines(prev => prev.map(l => l.id === line.id ? { ...l, status: "error" as MatchStatus, errorMsg: err.message || "Unknown error" } : l));
      }
      setProcessedCount(i + 1);
      if (i < toProcess.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    setProcessing(false);
    setStep("done");
  }, [lines]);

  const stats = {
    total: lines.length,
    matched: lines.filter(l => l.status === "matched").length,
    partial: lines.filter(l => l.status === "partial").length,
    ambiguous: lines.filter(l => l.status === "ambiguous").length,
    unmatched: lines.filter(l => l.status === "unmatched").length,
    duplicate: lines.filter(l => l.status === "duplicate").length,
    skipped: lines.filter(l => l.status === "skipped").length,
    done: lines.filter(l => l.status === "done").length,
    error: lines.filter(l => l.status === "error").length,
    totalWeight: lines.filter(l => l.status === "matched").reduce((s, l) => s + l.consumedWeightKg, 0),
  };

  const processableCount = lines.filter(l => l.status === "matched" && l.lotId).length;

  const reset = useCallback(() => {
    setParsed(null);
    setLines([]);
    setStep("upload");
    setProcessedCount(0);
  }, []);

  return {
    step, parsed, lines, lots, customers, stats, processing, processedCount, processableCount,
    handleFile, toggleSkip, updateLot, updateWeight, processAll, reset, setStep,
  };
}
