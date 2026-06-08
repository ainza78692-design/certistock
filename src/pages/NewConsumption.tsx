import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate, fmtKg } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Search, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function NewConsumption() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const cid = profile?.company_id;

  const [lotId, setLotId] = useState<string>(params.get("lot") || "");
  const [lotSearch, setLotSearch] = useState(params.get("q") || "");
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [consumptionDate, setConsumptionDate] = useState(new Date().toISOString().slice(0, 10));
  const [outwardTc, setOutwardTc] = useState("");
  const [destination, setDestination] = useState("");
  const [transportDoc, setTransportDoc] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [consumed, setConsumed] = useState("");
  const [outwardNet, setOutwardNet] = useState("");
  const [outwardGross, setOutwardGross] = useState("");
  const [outwardCert, setOutwardCert] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: lots } = useQuery({
    queryKey: ["active-lots", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) {
        const data = await localApi<any[]>("/api/stock-lots");
        return data.filter((lot) => lot.status === "active" && Number(lot.remaining_stock_kg || 0) > 0);
      }

      const { data } = await supabase.from("product_lots")
        .select("id, normalized_yarn_key, article_no, additional_info_raw, certified_weight_kg, remaining_stock_kg, transaction_certificates(tc_number), shipments(shipment_no, shipment_date)")
        .eq("company_id", cid!).eq("status", "active").gt("remaining_stock_kg", 0)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) return localApi<any[]>("/api/customers");

      const { data } = await supabase.from("customers").select("id, customer_name").eq("company_id", cid!).order("customer_name");
      return data || [];
    },
  });

  const filteredLots = useMemo(() => {
    const search = lotSearch.toUpperCase().trim();
    return [...(lots || [])]
      .filter((l: any) => {
        if (!search) return true;
        return (
          (l.normalized_yarn_key || "").toUpperCase().includes(search) ||
          (l.article_no || "").toUpperCase().includes(search) ||
          (l.additional_info_raw || "").toUpperCase().includes(search) ||
          (l.shipments?.shipment_no || "").toUpperCase().includes(search) ||
          (l.transaction_certificates?.tc_number || "").toUpperCase().includes(search)
        );
      })
      .sort((a: any, b: any) => {
        const ad = a.shipments?.shipment_date || "9999-12-31";
        const bd = b.shipments?.shipment_date || "9999-12-31";
        if (ad !== bd) return ad.localeCompare(bd);
        return (a.transaction_certificates?.tc_number || "").localeCompare(b.transaction_certificates?.tc_number || "");
      });
  }, [lots, lotSearch]);

  const lot = lots?.find((l: any) => l.id === lotId) as any;
  const consumedNum = Number(consumed || 0);
  const outwardCertNum = Number(outwardCert || consumed || 0);
  const remaining = Number(lot?.remaining_stock_kg || 0);
  const closing = remaining - consumedNum;
  const lossKg = consumedNum - outwardCertNum;
  const lossPct = consumedNum > 0 ? (lossKg / consumedNum) * 100 : 0;
  const overConsume = consumedNum > remaining;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cid || !lotId) return toast.error("Select a lot");
    if (!consumedNum || consumedNum <= 0) return toast.error("Enter consumed weight");
    if (overConsume) return toast.error("Cannot exceed remaining stock");
    if (!customerId && !newCustomer) return toast.error("Customer required");
    setSaving(true);
    try {
      if (isLocalBackend) {
        const data = await localApi<any>("/api/consumption", {
          method: "POST",
          body: JSON.stringify({
            productLotId: lotId,
            customerId: customerId || null,
            newCustomer: newCustomer || null,
            consumedWeightKg: consumedNum,
            consumptionDate: consumptionDate || null,
            remarks: remarks || null,
            outwardSale: {
              outward_invoice_no: invoiceNo || null,
              outward_invoice_date: invoiceDate || null,
              outward_tc_no: outwardTc || null,
              product_name: lot?.additional_info_raw || null,
              normalized_yarn_key: lot?.normalized_yarn_key || null,
              outward_net_weight_kg: outwardNet ? Number(outwardNet) : null,
              outward_gross_weight_kg: outwardGross ? Number(outwardGross) : null,
              outward_certified_weight_kg: outwardCertNum || consumedNum,
              transport_doc_no: transportDoc || null,
              vehicle_no: vehicleNo || null,
              destination: destination || null,
            },
          }),
        });
        if (!data?.ok) throw new Error(data?.error || "Consumption failed");
        if (data.xlsx?.status === "ready") {
          toast.success("Consumption recorded and mass balance sheet updated");
        } else {
          toast.warning("Consumption recorded, but XLSX needs regeneration");
        }
        navigate(`/lots/${lotId}`);
        return;
      }

      const { data, error } = await supabase.functions.invoke("record-consumption", {
        body: {
          productLotId: lotId,
          customerId: customerId || null,
          newCustomer: newCustomer || null,
          consumedWeightKg: consumedNum,
          consumptionDate: consumptionDate || null,
          remarks: remarks || null,
          outwardSale: {
            outward_invoice_no: invoiceNo || null,
            outward_invoice_date: invoiceDate || null,
            outward_tc_no: outwardTc || null,
            product_name: lot?.additional_info_raw || null,
            normalized_yarn_key: lot?.normalized_yarn_key || null,
            outward_net_weight_kg: outwardNet ? Number(outwardNet) : null,
            outward_gross_weight_kg: outwardGross ? Number(outwardGross) : null,
            outward_certified_weight_kg: outwardCertNum || consumedNum,
            transport_doc_no: transportDoc || null,
            vehicle_no: vehicleNo || null,
            destination: destination || null,
          },
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Consumption failed");
      if (data.xlsx?.status === "ready") {
        toast.success("Consumption recorded and mass balance sheet updated");
      } else {
        toast.warning("Consumption recorded, but XLSX needs regeneration");
      }
      navigate(`/lots/${lotId}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Record consumption"
        subtitle="Deduct from a certified lot, capture the customer sale, and store the outward certificate weights."
        actions={
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate("/consumption/bulk")}>
            <FileSpreadsheet className="h-4 w-4" />
            Bulk upload Excel
          </Button>
        }
      />
      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Source lot</h3>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-2" onClick={() => navigate("/consumption/bulk")}>
                <FileSpreadsheet className="h-4 w-4" />
                Upload saledump Excel
              </Button>
            </div>
            <div className="rounded-xl border border-dashed border-primary/25 bg-primary/[0.03] p-3 text-xs text-muted-foreground">
              Manual mode records one selected shipment lot. For multiple invoice rows, use Excel bulk upload to match TC number and shipment number automatically.
            </div>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input value={lotSearch} onChange={(event) => setLotSearch(event.target.value)} placeholder="Search 50D, shipment no., TC, article..."
                className="pl-9" />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {filteredLots.length ? filteredLots.map((l: any) => {
                const selected = l.id === lotId;
                return (
                  <button
                    type="button"
                    key={l.id}
                    onClick={() => setLotId(l.id)}
                    className={`w-full text-left rounded-xl border p-3 transition-all duration-200 hover:border-primary/40 hover:bg-primary/[0.02] ${selected ? "border-primary/50 bg-primary/[0.04]" : "border-border/60 bg-background"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{l.normalized_yarn_key || "Unmapped"}</span>
                          <Badge variant="secondary" className="border-0 bg-muted/60">
                            Shipment {l.shipments?.shipment_no || "-"}
                          </Badge>
                          {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {fmtDate(l.shipments?.shipment_date)} - {l.transaction_certificates?.tc_number || "-"} - {l.article_no || "-"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Remaining</div>
                        <div className="font-semibold tabular-nums">{fmtKg(l.remaining_stock_kg, 2)}</div>
                      </div>
                    </div>
                  </button>
                );
              }) : (
                <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  No active lots match this search.
                </div>
              )}
            </div>
            {lot && (
              <div className="text-xs text-muted-foreground rounded-xl bg-muted/40 p-3">
                Selected: <span className="font-medium text-foreground">{lot.normalized_yarn_key || "Unmapped"}</span>
                {" - "}Shipment {lot.shipments?.shipment_no || "-"}
                {" - "}{fmtDate(lot.shipments?.shipment_date)}
                {" - "}Remaining <span className="font-medium text-foreground">{fmtKg(lot.remaining_stock_kg, 3)}</span>
                {lot.additional_info_raw ? ` - ${lot.additional_info_raw}` : ""}
              </div>
            )}
          </div>

          <div className="surface p-5 space-y-4">
            <h3 className="text-sm font-semibold">Customer & invoice</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select existing customer" /></SelectTrigger>
                  <SelectContent>{customers?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="…or type a new customer name" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} />
              </div>
              <Field label="Invoice no." value={invoiceNo} onChange={setInvoiceNo} />
              <Field label="Invoice date" type="date" value={invoiceDate} onChange={setInvoiceDate} />
              <Field label="Consumption date" type="date" value={consumptionDate} onChange={setConsumptionDate} />
              <Field label="Outward TC no." value={outwardTc} onChange={setOutwardTc} />
              <Field label="Destination" value={destination} onChange={setDestination} />
              <Field label="Transport doc" value={transportDoc} onChange={setTransportDoc} />
              <Field label="Vehicle no." value={vehicleNo} onChange={setVehicleNo} />
            </div>
          </div>

          <div className="surface p-5 space-y-4">
            <h3 className="text-sm font-semibold">Weights</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Consumed weight (kg) *" type="number" value={consumed} onChange={setConsumed} />
              <Field label="Outward certified (kg)" type="number" value={outwardCert} onChange={setOutwardCert} />
              <Field label="Outward net (kg)" type="number" value={outwardNet} onChange={setOutwardNet} />
              <Field label="Outward gross (kg)" type="number" value={outwardGross} onChange={setOutwardGross} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface p-5 sticky top-20">
            <h3 className="text-sm font-semibold mb-4">Receipt</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Opening" value={fmtKg(remaining, 3)} />
              <Row label="Consumed" value={fmtKg(consumedNum, 3)} />
              <Row label="Closing" value={<span className={overConsume ? "text-destructive font-medium" : "font-medium"}>{fmtKg(closing, 3)}</span>} />
              <div className="border-t pt-3" />
              <Row label="Outward certified" value={fmtKg(outwardCertNum, 3)} />
              <Row label="Loss" value={`${fmtKg(lossKg, 3)} · ${lossPct.toFixed(2)}%`} />
            </dl>
            {overConsume && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-destructive-muted text-destructive text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Consumed exceeds remaining stock.
              </div>
            )}
            {lossPct > 5 && consumedNum > 0 && !overConsume && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-warning-muted text-warning-foreground/80 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Loss above 5% — please verify weights.
              </div>
            )}
            <Button type="submit" className="w-full mt-4" disabled={saving || overConsume}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Record consumption
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

const Field = ({ label, value, onChange, type = "text" }: any) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);
const Row = ({ label, value }: any) => (
  <div className="flex justify-between"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{value}</dd></div>
);
