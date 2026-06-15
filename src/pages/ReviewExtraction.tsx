import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalApiUrl, isLocalBackend } from "@/lib/backendMode";
import { localApi, localAuth } from "@/lib/localApi";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, FileText, Loader2, CheckCircle2, RefreshCw, Truck, Package, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { normalizeProductKey } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { Tables } from "@/integrations/supabase/types";

type UploadedFile = Tables<"uploaded_files">;
type ProductMasterOption = Pick<Tables<"product_master">, "id" | "normalized_key" | "display_name">;
type IncomingStockOption = Pick<Tables<"incoming_stock">, "id" | "invoice_no" | "yarn_count" | "net_weight_kg" | "normalized_yarn_key">;

type ExtractedProduct = {
  product_no?: string | null;
  shipment_no?: string | null;
  order_no?: string | null;
  article_no?: string | null;
  additional_info_raw?: string | null;
  yarn_count_raw?: string | null;
  number_of_units?: number | string | null;
  unit_type?: string | null;
  net_shipping_weight_kg?: number | string | null;
  certified_weight_kg?: number | string | null;
  production_date?: string | null;
  product_category?: string | null;
  product_detail?: string | null;
  material_composition?: string | null;
  standard_label_grade?: string | null;
  last_processor?: string | null;
  origin_country?: string | null;
  normalized_yarn_key?: string | null;
  normalization_confidence?: number | null;
  needs_manual_review?: boolean | null;
};

type ExtractedShipment = {
  shipment_no?: string | null;
  shipment_date?: string | null;
  shipment_doc_no?: string | null;
  invoice_reference?: string | null;
  gross_shipping_weight_kg?: number | string | null;
  consignee_name?: string | null;
  consignee_address?: string | null;
  consignee_te_id?: string | null;
};

type ExtractedPayload = {
  tc_number?: string | null;
  standard?: string | null;
  issue_date?: string | null;
  supplier_name?: string | null;
  supplier_te_id?: string | null;
  buyer_name?: string | null;
  gross_shipping_weight_kg?: number | string | null;
  net_shipping_weight_kg?: number | string | null;
  certified_weight_kg?: number | string | null;
  input_tcs?: string | null;
  shipments?: ExtractedShipment[];
  products?: ExtractedProduct[];
  _confidence?: number;
  _review_flags?: string[];
  _text_source?: string;
  _ocr_provider?: string;
  _ai_model?: string;
  _parser_version?: string;
};

type ProductLine = {
  product_no: string;
  shipment_no: string;
  order_no: string;
  article_no: string;
  additional_info_raw: string;
  yarn_count_raw: string;
  number_of_units: string;
  unit_type: string;
  net_shipping_weight_kg: string;
  certified_weight_kg: string;
  production_date: string;
  product_category: string;
  product_detail: string;
  material_composition: string;
  standard_label_grade: string;
  last_processor: string;
  origin_country: string;
  normalized_yarn_key: string | null;
  normalization_confidence?: number | null;
  needs_manual_review?: boolean;
  is_custom_product?: boolean;
  linked_incoming_stock_id?: string | null;
};

const blankLine = (): ProductLine => ({
  product_no: "", shipment_no: "", order_no: "", article_no: "", additional_info_raw: "", yarn_count_raw: "",
  number_of_units: "", unit_type: "BOX", net_shipping_weight_kg: "", certified_weight_kg: "",
  production_date: "", product_category: "", product_detail: "", material_composition: "",
  standard_label_grade: "", last_processor: "", origin_country: "",
  normalized_yarn_key: null, normalization_confidence: null, needs_manual_review: true, is_custom_product: false,
  linked_incoming_stock_id: null,
});

const combineProductRawInfo = (additionalInfo?: string | null, yarnCount?: string | null) => {
  const additional = (additionalInfo || "").trim();
  const yarn = (yarnCount || "").trim();
  if (!yarn) return additional;
  if (!additional) return `Yarn count: ${yarn}`;

  const normalizedAdditional = additional.toUpperCase();
  const normalizedYarn = yarn.toUpperCase();
  if (normalizedAdditional.includes("YARN COUNT") || normalizedAdditional.includes(normalizedYarn)) {
    return additional;
  }

  return `${additional} Yarn count: ${yarn}`;
};

const cleanSupplierName = (value?: string | null) => {
  const raw = (value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";

  const text = raw.replace(/^2\.\s*Seller of Certified Products\s*/i, "");
  const legalNameMatch = text.match(
    /^(.{2,140}?\b(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|Limited|Ltd\.?|LLP|Industries|Corporation))\b/i,
  );
  if (legalNameMatch?.[1]) return legalNameMatch[1].replace(/[,\s]+$/, "").trim();

  const markers = [
    " SC Number:",
    " Textile Exchange-ID",
    " Textile Exchange ID",
    " IDFL Client No",
    " Client No",
    " License No",
    " Buyer of",
    " 3. Buyer",
    " 4. Gross",
    " TE-ID:",
    " Block No",
    " Plot No",
    " PLOT NO",
    " Nr.",
    " Road",
    " Surat",
    " Gujarat",
    " India",
  ];
  const cutAt = markers
    .map((marker) => text.toUpperCase().indexOf(marker.toUpperCase()))
    .filter((index) => index > 2)
    .sort((a, b) => a - b)[0];

  return (cutAt ? text.slice(0, cutAt) : text).replace(/[,\s]+$/, "").trim();
};

const cleanInputTcs = (value?: string | null) => {
  const cleaned = (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+(?:Farm SCs?|Farm TCs?|Trader TCs?|9\.\s*Shipments|Shipment No\.?|10\.\s*Certified Products|Certified Products|Transaction Certificate Number)\b.*$/i, "")
    .replace(/[.;,\s]+$/, "")
    .trim();

  if (!cleaned) return "";
  if (/^(?:not\s+applicable|n\/?a|none|null|-)+$/i.test(cleaned)) return "";
  return cleaned;
};

const cleanInvoiceReference = (value?: string | null) =>
  (value || "")
    .replace(/\s+/g, " ")
    .replace(/^(?:Invoice References?|Invoice No\.?)\s*[:\-]?\s*/i, "")
    .replace(/\s+(?:Consignee(?:\s+name\s+and\s+address|\s+Name)?|TE-ID|Shipment No\.?|Shipment Date|Gross Shipping Weight)\b.*$/i, "")
    .trim();

const normalizeInvoiceComparable = (value?: string | null) =>
  cleanInvoiceReference(value)
    .toUpperCase()
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s+/g, " ")
    .trim();

const invoiceVariants = (value?: string | null) => {
  const normalized = normalizeInvoiceComparable(value);
  if (!normalized) return [];
  return Array.from(
    new Set([
      normalized,
      normalized.replace(/\(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\)/g, "").trim(),
      normalized.replace(/\s+/g, ""),
      normalized.replace(/\(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\)/g, "").replace(/\s+/g, ""),
    ].filter(Boolean)),
  );
};

const splitInvoiceReferences = (value?: string | null) =>
  (value || "")
    .split(/\s*(?:,|;|\n|\r|\band\b)\s*/i)
    .map((part) => cleanInvoiceReference(part))
    .map((part) => part?.trim())
    .filter(Boolean);

const normalizeIncomingStockKey = (stock: IncomingStockOption) =>
  stock.normalized_yarn_key || normalizeProductKey(stock.yarn_count || "");

export default function ReviewExtraction() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [tc, setTc] = useState({
    tc_number: "", supplier_name: "", supplier_te_id: "",
    issue_date: "", buyer_name: "", standard: "GRS",
    gross_shipping_weight_kg: "", net_shipping_weight_kg: "", certified_weight_kg: "",
    input_tcs: "",
  });
  const [shipments, setShipments] = useState([{
    shipment_no: "",
    shipment_date: "",
    shipment_doc_no: "",
    invoice_reference: "",
    gross_shipping_weight_kg: "",
    consignee_name: "",
    consignee_address: "",
    consignee_te_id: "",
  }]);
  const [products, setProducts] = useState<ProductLine[]>([blankLine()]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);


  const { data: file, refetch: refetchFile } = useQuery({
    queryKey: ["uploaded_file", fileId],
    queryFn: async () => {
      if (isLocalBackend) return localApi<any>(`/api/uploads/${fileId}`);

      const { data } = await supabase.from("uploaded_files").select("*").eq("id", fileId).single();
      return data;
    },
    enabled: !!fileId,
  });

  const { data: productMaster = [] } = useQuery<ProductMasterOption[]>({
    queryKey: ["product_master_options", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      if (isLocalBackend) {
        const data = await localApi<any[]>("/api/product-master");
        return data.map((product) => ({
          id: product.id,
          normalized_key: product.normalized_key,
          display_name: product.display_name,
        }));
      }

      const { data } = await supabase.from("product_master")
        .select("id, normalized_key, display_name")
        .eq("company_id", profile!.company_id!)
        .eq("is_active", true)
        .order("normalized_key");
      return data || [];
    },
  });

  const { data: incomingStock = [] } = useQuery<IncomingStockOption[]>({
    queryKey: ["incoming_stock_options", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      if (isLocalBackend) {
        return localApi<IncomingStockOption[]>("/api/incoming-stock");
      }
      const { data } = await supabase.from("incoming_stock")
        .select("id, invoice_no, yarn_count, net_weight_kg, normalized_yarn_key")
        .eq("company_id", profile!.company_id!)
        .is("matched_tc_id", null)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const productOptions = useMemo(() => {
    const seen = new Set(productMaster.map((product) => product.normalized_key));
    const detected = products
      .map((product) => product.normalized_yarn_key)
      .filter((key): key is string => Boolean(key && !seen.has(key)));

    return [
      ...productMaster,
      ...Array.from(new Set(detected)).map((key) => ({
        id: `detected-${key}`,
        normalized_key: key,
        display_name: `${key} (detected)`,
      })),
    ];
  }, [productMaster, products]);

  useEffect(() => {
    if (file?.storage_path) {
      if (isLocalBackend) {
        const token = localAuth.getToken();
        const url = `${getLocalApiUrl()}/api/uploads/${file.id}/file${token ? `?token=${encodeURIComponent(token)}` : ""}`;
        setPdfUrl(url);
      } else {
      supabase.storage.from("tc-pdfs").createSignedUrl(file.storage_path, 3600)
        .then(({ data }) => data?.signedUrl && setPdfUrl(data.signedUrl));
      }
    }
    const ex = file?.extracted_json && typeof file.extracted_json === "object"
      ? file.extracted_json as ExtractedPayload
      : null;
    if (ex && typeof ex === "object") {
      setTc({
        tc_number: ex.tc_number ?? "",
        standard: ex.standard ?? "GRS",
        issue_date: ex.issue_date ?? "",
        supplier_name: cleanSupplierName(ex.supplier_name) || "",
        supplier_te_id: ex.supplier_te_id ?? "",
        buyer_name: ex.buyer_name ?? "",
        gross_shipping_weight_kg: ex.gross_shipping_weight_kg?.toString() ?? "",
        net_shipping_weight_kg: ex.net_shipping_weight_kg?.toString() ?? "",
        certified_weight_kg: ex.certified_weight_kg?.toString() ?? "",
        input_tcs: cleanInputTcs(ex.input_tcs),
      });
      if (Array.isArray(ex.shipments) && ex.shipments.length) {
        setShipments(ex.shipments.map((s) => ({
          shipment_no: s.shipment_no ?? "", shipment_date: s.shipment_date ?? "",
          shipment_doc_no: s.shipment_doc_no ?? "", invoice_reference: s.invoice_reference ?? "",
          gross_shipping_weight_kg: s.gross_shipping_weight_kg?.toString() ?? "",
          consignee_name: s.consignee_name ?? "",
          consignee_address: s.consignee_address ?? "",
          consignee_te_id: s.consignee_te_id ?? "",
        })));
      }
      if (Array.isArray(ex.products) && ex.products.length) {
        setProducts(ex.products.map((p) => {
          const rawInfo = combineProductRawInfo(p.additional_info_raw, p.yarn_count_raw);
          const deterministicKey = normalizeProductKey(rawInfo || p.yarn_count_raw, p.article_no);
          const normalizedKey = deterministicKey || p.normalized_yarn_key || null;
          return {
            product_no: p.product_no ?? "", order_no: p.order_no ?? "", article_no: p.article_no ?? "",
            shipment_no: p.shipment_no ?? p.product_no ?? "",
            additional_info_raw: rawInfo, yarn_count_raw: p.yarn_count_raw ?? "",
            number_of_units: p.number_of_units?.toString() ?? "", unit_type: p.unit_type ?? "BOX",
            net_shipping_weight_kg: p.net_shipping_weight_kg?.toString() ?? "",
            certified_weight_kg: p.certified_weight_kg?.toString() ?? "",
            production_date: p.production_date ?? "",
            product_category: p.product_category ?? "",
            product_detail: p.product_detail ?? "",
            material_composition: p.material_composition ?? "",
            standard_label_grade: p.standard_label_grade ?? "",
            last_processor: p.last_processor ?? "",
            origin_country: p.origin_country ?? "",
            normalized_yarn_key: normalizedKey,
            normalization_confidence: typeof p.normalization_confidence === "number" ? p.normalization_confidence : null,
            needs_manual_review: Boolean(!normalizedKey),
            is_custom_product: false,
          };
        }));
      }
    }
  }, [file]);

  // Auto-link incoming stock using invoice normalization plus product-key compatibility.
  useEffect(() => {
    if (!incomingStock.length || !products.length || !shipments.length) return;
    
    setProducts(prev => {
      let changed = false;
      const next = prev.map(p => {
        if (p.linked_incoming_stock_id) return p; // already linked

        const shipment = shipments.find(s => s.shipment_no === p.shipment_no || (!s.shipment_no && s.shipment_doc_no));
        const invoiceNos = splitInvoiceReferences(shipment?.invoice_reference);
        if (!invoiceNos.length || !p.normalized_yarn_key) return p;

        const invoiceSet = new Set(invoiceNos.flatMap((invoice) => invoiceVariants(invoice)));
        const matches = incomingStock.filter((inc) => {
          const sameInvoice = invoiceVariants(inc.invoice_no).some((variant) => invoiceSet.has(variant));
          if (!sameInvoice) return false;
          return normalizeIncomingStockKey(inc) === p.normalized_yarn_key;
        });

        if (matches.length === 1) {
          changed = true;
          return { ...p, linked_incoming_stock_id: matches[0].id };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [incomingStock, shipments, products.length]);

  const updateProduct = (i: number, patch: Partial<ProductLine>) => {
    setProducts(prev => prev.map((p, idx) => {
      if (idx !== i) return p;
      const next = { ...p, ...patch };
      if (patch.normalized_yarn_key !== undefined) {
        if (patch.normalized_yarn_key === "__CREATE_NEW__") {
          next.is_custom_product = true;
          next.normalized_yarn_key = "";
          next.needs_manual_review = true;
        } else {
          next.is_custom_product = false;
          next.needs_manual_review = !patch.normalized_yarn_key;
        }
      } else if (
        patch.additional_info_raw !== undefined ||
        patch.yarn_count_raw !== undefined ||
        patch.article_no !== undefined
      ) {
        next.normalized_yarn_key = normalizeProductKey(next.additional_info_raw || next.yarn_count_raw, next.article_no);
        next.needs_manual_review = !next.normalized_yarn_key;
      }
      return next;
    }));
  };

  const totals = products.reduce((acc, p) => ({
    cert: acc.cert + Number(p.certified_weight_kg || 0),
    net: acc.net + Number(p.net_shipping_weight_kg || 0),
  }), { cert: 0, net: 0 });

  const tcCertWeight = Number(tc.certified_weight_kg || 0);
  const certMismatch = tcCertWeight > 0 && Math.abs(totals.cert - tcCertWeight) > 0.01;

  const retryExtraction = async () => {
    if (!fileId) return;
    setRetrying(true);
    if (isLocalBackend) {
      try {
        await localApi(`/api/uploads/${fileId}/extract`, { method: "POST" });
        await refetchFile();
        toast.success("Auto extraction refreshed");
      } catch {
        toast.error("Auto extraction failed - you can still fill manually");
      } finally {
        setRetrying(false);
      }
      return;
    }

    const { error } = await supabase.functions.invoke("extract-tc", { body: { fileId } });
    setRetrying(false);
    if (error) { toast.error("Auto extraction failed - you can still fill manually"); return; }
    await refetchFile();
    toast.success("Auto extraction refreshed");
  };

  const approve = async () => {
    if (!profile?.company_id) return;
    if (!tc.tc_number) return toast.error("TC number required");
    const supplierName = cleanSupplierName(tc.supplier_name);
    if (!supplierName) return toast.error("Supplier required");
    if (!products.length) return toast.error("At least one product line is required");
    if (products.some(p => !p.net_shipping_weight_kg)) return toast.error("All product net weights required");
    if (products.some(p => !p.normalized_yarn_key)) return toast.error("Select a product key for every product line");
    setSaving(true);
    try {
      const normalizedTc = {
        ...tc,
        supplier_name: supplierName,
        input_tcs: cleanInputTcs(tc.input_tcs) || null,
      };

      if (isLocalBackend) {
        const data = await localApi<any>(`/api/uploads/${fileId}/approve`, {
          method: "POST",
          body: JSON.stringify({ tc: normalizedTc, shipments, products }),
        });
        if (!data?.ok) throw new Error(data?.error || "Failed to approve");
        // Inform user if any incoming stock was reconciled by invoice fallback
        const matchedCount = data?.incomingReconciliation?.matchedCount || 0;
        if (matchedCount > 0) {
          toast.success(`TC approved - ${matchedCount} incoming stock record(s) reconciled`);
        } else {
          toast.success("TC approved - stock lots created");
        }
        navigate(`/lots?q=${encodeURIComponent(tc.tc_number)}`);
        return;
      }

      const { data: duplicate } = await supabase.from("transaction_certificates")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("tc_number", tc.tc_number)
        .maybeSingle();
      if (duplicate) throw new Error("This TC number already exists");

      // 1. Find or create supplier
      let supplierId: string | null = null;
      const { data: existing } = await supabase.from("suppliers")
        .select("id").eq("company_id", profile.company_id).ilike("supplier_name", supplierName).maybeSingle();
      if (existing) supplierId = existing.id;
      else {
        const { data: s, error } = await supabase.from("suppliers").insert({
          company_id: profile.company_id, supplier_name: supplierName, te_id: tc.supplier_te_id || null,
        }).select().single();
        if (error) throw error;
        supplierId = s.id;
      }

      // 2. Create TC
      const { data: tcRow, error: tcErr } = await supabase.from("transaction_certificates").insert({
        company_id: profile.company_id,
        uploaded_file_id: fileId,
        supplier_id: supplierId,
        tc_number: tc.tc_number,
        standard: tc.standard,
        status: "valid",
        issue_date: tc.issue_date || null,
        buyer_name: tc.buyer_name || null,
        seller_te_id: tc.supplier_te_id || null,
        gross_shipping_weight_kg: tc.gross_shipping_weight_kg ? Number(tc.gross_shipping_weight_kg) : null,
        net_shipping_weight_kg: tc.net_shipping_weight_kg ? Number(tc.net_shipping_weight_kg) : null,
        certified_weight_kg: tc.certified_weight_kg ? Number(tc.certified_weight_kg) : null,
        input_tcs: normalizedTc.input_tcs,
        review_status: "approved",
        created_by: user?.id,
      }).select().single();
      if (tcErr) throw tcErr;

      // 3. Shipments
      const shipmentMap: Record<string, string> = {};
      for (const sh of shipments) {
        if (!sh.shipment_no) continue;
        const { data: shipRow, error } = await supabase.from("shipments").insert({
          company_id: profile.company_id, transaction_certificate_id: tcRow.id,
          shipment_no: sh.shipment_no, shipment_date: sh.shipment_date || null,
          shipment_doc_no: sh.shipment_doc_no || null, invoice_reference: sh.invoice_reference || null,
          gross_shipping_weight_kg: sh.gross_shipping_weight_kg ? Number(sh.gross_shipping_weight_kg) : null,
          consignee_name: sh.consignee_name || null,
          consignee_address: sh.consignee_address || null,
          consignee_te_id: sh.consignee_te_id || null,
        }).select().single();
        if (error) throw error;
        shipmentMap[sh.shipment_no] = shipRow.id;
      }

      // 4. Product lots
      for (const p of products) {
        const stockWeight = Number(p.net_shipping_weight_kg || p.certified_weight_kg || 0);
        if (!stockWeight) throw new Error("All product net weights required");
        
        let pmId = null;
        if (p.normalized_yarn_key) {
          const { data: pmRow } = await supabase.from("product_master")
            .select("id").eq("company_id", profile.company_id).eq("normalized_key", p.normalized_yarn_key).maybeSingle();
          pmId = pmRow?.id;
          
          if (!pmId) {
            const { data: newPm, error: pmErr } = await supabase.from("product_master").insert({
              company_id: profile.company_id,
              normalized_key: p.normalized_yarn_key,
              display_name: p.normalized_yarn_key
            }).select("id").single();
            if (pmErr) throw pmErr;
            pmId = newPm.id;
          }
        }

        const { data: lotRow, error: lotErr } = await supabase.from("product_lots").insert({
          company_id: profile.company_id,
          transaction_certificate_id: tcRow.id,
          shipment_id: shipmentMap[p.shipment_no || p.product_no] || null,
          product_master_id: pmId,
          product_no: p.product_no || null,
          shipment_product_no: p.shipment_no ? `${p.shipment_no}${p.product_no ? ` / ${p.product_no}` : ""}` : p.product_no || null,
          order_no: p.order_no || null,
          article_no: p.article_no || null,
          number_of_units: p.number_of_units ? Number(p.number_of_units) : null,
          unit_type: p.unit_type || null,
          net_shipping_weight_kg: Number(p.net_shipping_weight_kg || stockWeight),
          certified_weight_kg: stockWeight,
          production_date: p.production_date || null,
          product_category: p.product_category || null,
          product_detail: p.product_detail || null,
          material_composition: p.material_composition || null,
          standard_label_grade: p.standard_label_grade || null,
          additional_info_raw: p.additional_info_raw || null,
          yarn_count_raw: p.yarn_count_raw || null,
          normalized_yarn_key: p.normalized_yarn_key,
          last_processor: p.last_processor || null,
          origin_country: p.origin_country || null,
          opening_stock_kg: stockWeight,
          remaining_stock_kg: stockWeight,
          status: "active",
          needs_manual_review: false,
        }).select().single();
        if (lotErr) throw lotErr;

        await supabase.from("stock_ledger").insert({
          company_id: profile.company_id, product_lot_id: lotRow.id, transaction_type: "inward",
          reference_type: "transaction_certificate", reference_id: tcRow.id,
          qty_in_kg: stockWeight, balance_before_kg: 0, balance_after_kg: stockWeight,
          remarks: "Initial inward from TC " + tc.tc_number, created_by: user?.id,
        });

        if (p.linked_incoming_stock_id) {
          const { data: incRes } = await supabase.from("incoming_stock")
            .select("net_weight_kg").eq("id", p.linked_incoming_stock_id).eq("company_id", profile.company_id).maybeSingle();
          if (incRes) {
            const oldWeight = Number(incRes.net_weight_kg) || 0;
            const newWeight = oldWeight - stockWeight;
            if (newWeight <= 0) {
              await supabase.from("incoming_stock").delete().eq("id", p.linked_incoming_stock_id);
            } else {
              await supabase.from("incoming_stock").update({ net_weight_kg: newWeight, updated_at: new Date().toISOString() }).eq("id", p.linked_incoming_stock_id);
            }
          }
        }
      }

      await supabase.from("uploaded_files").update({ parsing_status: "approved" }).eq("id", fileId);
      toast.success("TC approved — stock lots created");
      navigate(`/lots?q=${encodeURIComponent(tc.tc_number)}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setSaving(false);
    }
  };

  const currentFile = file as UploadedFile | undefined;
  const extractedJson = currentFile?.extracted_json;
  const extractedMeta = extractedJson && typeof extractedJson === "object" ? extractedJson as ExtractedPayload : {};
  const extractionConfidence = typeof extractedMeta._confidence === "number" ? extractedMeta._confidence : null;
  const reviewFlags = Array.isArray(extractedMeta._review_flags)
    ? extractedMeta._review_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  const extractionBadgeText = extractionConfidence === null
    ? "OCR + AI prefilled - please verify"
    : `OCR + AI prefilled (${Math.round(extractionConfidence)}%) - please verify`;


  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Review extraction"
        subtitle="Verify the structured data extracted from this PDF, then approve to create stock lots."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={retryExtraction} disabled={retrying || saving}>
              {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Re-run auto extraction
            </Button>
            <Button onClick={approve} disabled={saving || retrying}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Approve & create lots
            </Button>
          </div>
        }
      />
      <ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-11rem)] items-stretch rounded-2xl border border-border/50 shadow-sm overflow-hidden bg-background">
        <ResizablePanel defaultSize={50} minSize={20} collapsible={true} className="bg-muted/10 relative">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full border-0 absolute inset-0" title="PDF" />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground gap-2">
              <FileText className="h-5 w-5" /> Loading PDF…
            </div>
          )}
        </ResizablePanel>
        
        <ResizableHandle withHandle className="w-1.5 bg-border/40 hover:bg-primary/20 transition-colors data-[resize-handle-state=hover]:bg-primary/40 data-[resize-handle-state=drag]:bg-primary/60" />
        
        <ResizablePanel defaultSize={50} minSize={30} className="bg-muted/5">
          <div className="h-full overflow-y-auto p-5 space-y-5">
            <div className="surface p-5 border-border/40">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold tracking-tight">Transaction Certificate</h3>
                {currentFile?.extracted_json ? (
                  <Badge className="bg-primary/10 text-primary border-0 text-[10px] font-medium">{extractionBadgeText}</Badge>
                ) : currentFile?.parser_error ? (
                  <Badge variant="outline" className="border-warning/40 text-warning text-[10px]">Manual entry</Badge>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="TC number" value={tc.tc_number} onChange={v => setTc({ ...tc, tc_number: v })} mono />
                <Field label="Standard" value={tc.standard} onChange={v => setTc({ ...tc, standard: v })} />
                <Field label="Supplier" value={tc.supplier_name} onChange={v => setTc({ ...tc, supplier_name: v })} />
                <Field label="Supplier TE-ID" value={tc.supplier_te_id} onChange={v => setTc({ ...tc, supplier_te_id: v })} />
                <Field label="Buyer" value={tc.buyer_name} onChange={v => setTc({ ...tc, buyer_name: v })} />
                <Field label="Issue date" type="date" value={tc.issue_date} onChange={v => setTc({ ...tc, issue_date: v })} />
                <Field label="Gross weight (kg)" type="number" value={tc.gross_shipping_weight_kg} onChange={v => setTc({ ...tc, gross_shipping_weight_kg: v })} />
                <Field label="Net weight (kg)" type="number" value={tc.net_shipping_weight_kg} onChange={v => setTc({ ...tc, net_shipping_weight_kg: v })} />
                <Field label="Certified weight (kg)" type="number" value={tc.certified_weight_kg} onChange={v => setTc({ ...tc, certified_weight_kg: v })} />
              </div>
              {cleanInputTcs(tc.input_tcs) ? (
                <div className="mt-4 rounded-xl border border-border/50 bg-muted/25 p-3">
                  <Field
                    label="Certified Input References"
                    value={cleanInputTcs(tc.input_tcs)}
                    onChange={v => setTc({ ...tc, input_tcs: v })}
                    mono
                  />
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">No certified input references listed.</p>
              )}
            </div>

          <div className="surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Shipments</h3>
              <Button size="sm" variant="ghost" onClick={() => setShipments([...shipments, {
                shipment_no: "",
                shipment_date: "",
                shipment_doc_no: "",
                invoice_reference: "",
                gross_shipping_weight_kg: "",
                consignee_name: "",
                consignee_address: "",
                consignee_te_id: "",
              }])}>
                <Plus className="h-3 w-3 mr-1" /> Add shipment
              </Button>
            </div>
            {shipments.length === 0 && (
              <p className="text-xs text-muted-foreground mb-4">No shipments added yet.</p>
            )}
            <Accordion type="multiple" defaultValue={["shipment-0"]} className="space-y-3">
              {shipments.map((s, i) => (
                <AccordionItem key={i} value={`shipment-${i}`} className="border border-border/50 rounded-xl px-4 bg-background/50 overflow-hidden data-[state=open]:bg-accent/5 data-[state=open]:border-primary/20 transition-colors shadow-sm">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 text-sm">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{s.shipment_no || `Shipment ${i + 1}`}</span>
                      {s.shipment_date && <span className="text-muted-foreground font-normal text-xs">{s.shipment_date}</span>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pt-1">
                    <div className="flex justify-end mb-3">
                      <Button size="sm" variant="ghost" onClick={() => setShipments(prev => prev.filter((_, idx) => idx !== i))} className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove shipment
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Shipment no." value={s.shipment_no} onChange={v => setShipments(prev => prev.map((x, idx) => idx === i ? { ...x, shipment_no: v } : x))} />
                      <Field label="Date" type="date" value={s.shipment_date} onChange={v => setShipments(prev => prev.map((x, idx) => idx === i ? { ...x, shipment_date: v } : x))} />
                      <Field label="Doc no." value={s.shipment_doc_no} onChange={v => setShipments(prev => prev.map((x, idx) => idx === i ? { ...x, shipment_doc_no: v } : x))} />
                      <Field label="Invoice" value={s.invoice_reference} onChange={v => setShipments(prev => prev.map((x, idx) => idx === i ? { ...x, invoice_reference: cleanInvoiceReference(v) } : x))} />
                      <div className="col-span-2">
                        <Field label="Consignee" value={s.consignee_name} onChange={v => setShipments(prev => prev.map((x, idx) => idx === i ? { ...x, consignee_name: v } : x))} />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Product lines</h3>
              <Button size="sm" variant="ghost" onClick={() => setProducts([...products, blankLine()])}>
                <Plus className="h-3 w-3 mr-1" /> Add product
              </Button>
            </div>
            {certMismatch && (
              <div className="text-xs px-3 py-2 rounded-lg bg-warning-muted/40 text-warning-foreground/90 border border-warning/20 mb-4 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
                <span>Product totals ({totals.cert.toFixed(3)} kg) don't match TC certified weight ({tcCertWeight.toFixed(3)} kg).</span>
              </div>
            )}
            <Accordion 
              type="multiple" 
              defaultValue={products.map((p, i) => p.needs_manual_review ? `product-${i}` : "").filter(Boolean)} 
              className="space-y-3"
            >
              {products.map((p, i) => (
                <AccordionItem key={i} value={`product-${i}`} className="border border-border/50 rounded-xl px-4 bg-background/50 overflow-hidden data-[state=open]:bg-accent/5 data-[state=open]:border-primary/20 transition-colors shadow-sm">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex flex-1 items-center justify-between pr-4">
                      <div className="flex items-center gap-3">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">{p.normalized_yarn_key || `Product Line ${i + 1}`}</span>
                        {p.net_shipping_weight_kg && (
                          <span className="text-muted-foreground font-normal text-xs tabular-nums">
                            {Number(p.net_shipping_weight_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                          </span>
                        )}
                      </div>
                      <div className="flex items-center">
                        {p.needs_manual_review 
                          ? <Badge variant="outline" className="border-warning/40 text-warning bg-warning/5 text-[10px] font-medium"><AlertCircle className="w-3 h-3 mr-1"/> Review</Badge>
                          : <Badge className="bg-success/10 text-success border-0 text-[10px] font-medium"><CheckCircle2 className="w-3 h-3 mr-1"/> Ready</Badge>
                        }
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pt-1">
                    <div className="flex justify-end mb-3">
                      <Button size="sm" variant="ghost" onClick={() => setProducts(prev => prev.filter((_, idx) => idx !== i))} className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove line
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Product no." value={p.product_no} onChange={v => updateProduct(i, { product_no: v })} />
                      <Field label="Shipment no." value={p.shipment_no} onChange={v => updateProduct(i, { shipment_no: v })} />
                      <Field label="Article no." value={p.article_no} onChange={v => updateProduct(i, { article_no: v })} mono />
                      <div className="col-span-2">
                        <Field label="Yarn / additional info (raw)" value={p.additional_info_raw} onChange={v => updateProduct(i, { additional_info_raw: v })} />
                      </div>
                      <Field label="Units" type="number" value={p.number_of_units} onChange={v => updateProduct(i, { number_of_units: v })} />
                      <Field label="Unit type" value={p.unit_type} onChange={v => updateProduct(i, { unit_type: v })} />
                      <Field label="Net weight (kg)" type="number" value={p.net_shipping_weight_kg} onChange={v => updateProduct(i, { net_shipping_weight_kg: v })} />
                      <div className="col-span-2 space-y-1.5 mt-2">
                        <Label className="text-xs font-semibold">Product key mapping</Label>
                        <Select value={p.is_custom_product ? "__CREATE_NEW__" : (p.normalized_yarn_key || "")} onValueChange={value => updateProduct(i, { normalized_yarn_key: value })}>
                          <SelectTrigger className={p.normalized_yarn_key || p.is_custom_product ? "h-10 rounded-xl" : "h-10 rounded-xl border-warning/50 bg-warning/5 ring-warning/20 focus:ring-warning/30"}>
                            <SelectValue placeholder="Select the official product key to map this to" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {productOptions.map((product) => (
                              <SelectItem key={product.id} value={product.normalized_key}>
                                <span className="font-medium">{product.normalized_key}</span>
                                {product.display_name && <span className="text-muted-foreground ml-2">— {product.display_name}</span>}
                              </SelectItem>
                            ))}
                            <SelectItem value="__CREATE_NEW__">
                              <span className="font-medium italic text-primary">+ Create new product...</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {p.is_custom_product && (
                          <div className="mt-2">
                            <Input
                              autoFocus
                              placeholder="Type new product key (e.g. 300D)"
                              value={p.normalized_yarn_key || ""}
                              onChange={e => {
                                const val = e.target.value;
                                setProducts(prev => prev.map((x, idx) => idx === i ? { ...x, normalized_yarn_key: val, needs_manual_review: !val } : x));
                              }}
                              className="h-10 rounded-xl border-primary/40 focus-visible:ring-primary/30"
                            />
                          </div>
                        )}
                        {!p.normalized_yarn_key && (
                          <p className="text-xs text-warning/90 mt-1.5 flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> Product key could not be mapped. Please select it manually before approval.</p>
                        )}
                      </div>
                      
                      <div className="col-span-2 space-y-1.5 mt-2">
                        <Label className="text-xs font-semibold">Link to Incoming Stock</Label>
                        <Select value={p.linked_incoming_stock_id || "none"} onValueChange={value => updateProduct(i, { linked_incoming_stock_id: value === "none" ? null : value })}>
                          <SelectTrigger className="h-10 rounded-xl">
                            <SelectValue placeholder="Select an incoming stock to deduct from" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl max-h-[300px]">
                            <SelectItem value="none">
                              <span className="font-medium text-muted-foreground">Do not deduct from incoming stock</span>
                            </SelectItem>
                            {incomingStock.map((inc) => (
                              <SelectItem key={inc.id} value={inc.id}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{inc.invoice_no} — {inc.yarn_count}</span>
                                  <span className="text-xs text-muted-foreground">Pending: {inc.net_weight_kg} kg</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground mt-1">If selected, the net weight will be precisely deducted from the selected incoming stock.</p>
                      </div>

                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", mono = false }:
  { label: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {type === "date" ? (
        <DatePicker value={value} onChange={onChange} className={`h-9 ${mono ? "font-mono text-xs" : ""}`} />
      ) : (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)}
          className={`h-9 ${mono ? "font-mono text-xs" : ""}`} />
      )}
    </div>
  );
}
