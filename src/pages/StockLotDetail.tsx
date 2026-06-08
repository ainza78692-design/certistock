import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalApiUrl, isLocalBackend } from "@/lib/backendMode";
import { localApi, localAuth } from "@/lib/localApi";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { fmtKg, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, ArrowLeft, Download, RefreshCw, FileSpreadsheet, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const safeWorkbookPart = (value: unknown, fallback: string) => {
  const raw = String(value || fallback).trim() || fallback;
  return raw
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "") || fallback;
};

const workbookFileNameForLot = (lot: any, workbook?: any) => {
  if (workbook?.file_name) return workbook.file_name;
  const tc = safeWorkbookPart(lot?.transaction_certificates?.tc_number, "tc");
  const shipment = safeWorkbookPart(lot?.shipments?.shipment_no || lot?.product_no, "shipment");
  const product = safeWorkbookPart(lot?.normalized_yarn_key, "lot");
  return `${tc}_${shipment}_${product}.xlsx`;
};

const downloadSignedWorkbook = async (signedUrl: string, fileName: string) => {
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("Workbook download failed");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

export default function StockLotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const { data: lot } = useQuery({
    queryKey: ["lot", id],
    enabled: !!id && !!profile?.company_id,
    queryFn: async () => {
      if (isLocalBackend) return localApi<any>(`/api/stock-lots/${id}`);

      const { data } = await supabase.from("product_lots")
        .select("*, transaction_certificates(tc_number, suppliers(supplier_name)), shipments(shipment_no, shipment_date, shipment_doc_no)")
        .eq("id", id).single();
      return data as any;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["lot-entries", id],
    enabled: !!id,
    queryFn: async () => {
      if (isLocalBackend) return localApi<any[]>(`/api/stock-lots/${id}/entries`);

      const { data } = await supabase.from("consumption_entries")
        .select("*, outward_sales(outward_invoice_no, customer_name_snapshot, customers(customer_name))")
        .eq("product_lot_id", id).order("consumption_date", { ascending: false });
      return data || [];
    },
  });

  const { data: ledger } = useQuery({
    queryKey: ["lot-ledger", id],
    enabled: !!id,
    queryFn: async () => {
      if (isLocalBackend) return localApi<any[]>(`/api/stock-lots/${id}/ledger`);

      const { data } = await supabase.from("stock_ledger").select("*").eq("product_lot_id", id).order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: workbook, refetch: refetchWorkbook } = useQuery({
    queryKey: ["mass-balance-workbook", id],
    enabled: !!id && !!profile?.company_id,
    queryFn: async () => {
      if (isLocalBackend) return localApi<any | null>(`/api/stock-lots/${id}/mass-balance`);

      const { data } = await supabase.from("mass_balance_workbooks")
        .select("*")
        .eq("product_lot_id", id)
        .maybeSingle();
      return data as any;
    },
  });

  const handleWorkbook = async (action: "download" | "regenerate") => {
    if (!id) return;
    setXlsxBusy(true);
    try {
      if (isLocalBackend) {
        if (action === "regenerate") {
          const data = await localApi<any>(`/api/stock-lots/${id}/mass-balance`, { method: "POST" });
          if (!data?.ok) throw new Error(data?.error || "Workbook request failed");
          await refetchWorkbook();
          toast.success("Mass balance XLSX regenerated");
          return;
        }

        const token = localAuth.getToken();
        const response = await fetch(`${getLocalApiUrl()}/api/stock-lots/${id}/mass-balance/download`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error("Workbook download failed");
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = workbookFileNameForLot(lot, workbook);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
        toast.success(`Downloaded ${workbookFileNameForLot(lot, workbook)}`);
        return;
      }

      const { data, error } = await supabase.functions.invoke("mass-balance-xlsx", {
        body: { action, productLotId: id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Workbook request failed");
      await refetchWorkbook();
      if (action === "download" && data.signedUrl) {
        const fileName = data.fileName || workbookFileNameForLot(lot, data.workbook);
        try {
          await downloadSignedWorkbook(data.signedUrl, fileName);
        } catch {
          window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        }
        toast.success(`Downloaded ${fileName}`);
      } else {
        toast.success("Mass balance XLSX regenerated");
      }
    } catch (error: any) {
      toast.error(error.message || "Mass balance XLSX failed");
    } finally {
      setXlsxBusy(false);
    }
  };

  const deleteConsumption = async (entry: any) => {
    if (!id) return;
    setDeletingEntryId(entry.id);
    try {
      if (isLocalBackend) {
        const data = await localApi<any>(`/api/consumption/${entry.id}?reason=${encodeURIComponent("Deleted from Stock Lot detail page")}`, {
          method: "DELETE",
        });
        if (!data?.ok) throw new Error(data?.error || "Could not delete consumption");

        if (data.xlsx?.status === "ready") {
          toast.success("Consumption deleted, stock restored, and Mass Balance XLSX updated");
        } else {
          toast.warning("Consumption deleted and stock restored, but XLSX needs regeneration");
        }

        queryClient.invalidateQueries({ queryKey: ["lot", id] });
        queryClient.invalidateQueries({ queryKey: ["lot-entries", id] });
        queryClient.invalidateQueries({ queryKey: ["lot-ledger", id] });
        queryClient.invalidateQueries({ queryKey: ["mass-balance-workbook", id] });
        queryClient.invalidateQueries({ queryKey: ["consumption", profile?.company_id] });
        queryClient.invalidateQueries({ queryKey: ["lots", profile?.company_id] });
        return;
      }

      const { data, error } = await supabase.functions.invoke("delete-consumption", {
        body: {
          consumptionEntryId: entry.id,
          reason: "Deleted from Stock Lot detail page",
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Could not delete consumption");

      if (data.xlsx?.status === "ready") {
        toast.success("Consumption deleted, stock restored, and Mass Balance XLSX updated");
      } else {
        toast.warning("Consumption deleted and stock restored, but XLSX needs regeneration");
      }

      queryClient.invalidateQueries({ queryKey: ["lot", id] });
      queryClient.invalidateQueries({ queryKey: ["lot-entries", id] });
      queryClient.invalidateQueries({ queryKey: ["lot-ledger", id] });
      queryClient.invalidateQueries({ queryKey: ["mass-balance-workbook", id] });
      queryClient.invalidateQueries({ queryKey: ["consumption", profile?.company_id] });
      queryClient.invalidateQueries({ queryKey: ["lots", profile?.company_id] });
    } catch (error: any) {
      toast.error(error.message || "Could not delete consumption");
    } finally {
      setDeletingEntryId(null);
    }
  };

  if (!lot) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const workbookFileName = workbookFileNameForLot(lot, workbook);

  return (
    <div className="max-w-6xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3 -ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <PageHeader
        title={`${lot.normalized_yarn_key || "Unmapped"} · ${lot.transaction_certificates?.tc_number}`}
        subtitle={lot.additional_info_raw || ""}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => handleWorkbook("download")} disabled={xlsxBusy}>
              <Download className="h-4 w-4 mr-2" />Download Mass Balance XLSX
            </Button>
            <Button variant="outline" onClick={() => handleWorkbook("regenerate")} disabled={xlsxBusy}>
              <RefreshCw className={`h-4 w-4 mr-2 ${xlsxBusy ? "animate-spin" : ""}`} />Regenerate XLSX
            </Button>
            <Button onClick={() => navigate(`/consumption/new?lot=${lot.id}`)}>
              <ShoppingCart className="h-4 w-4 mr-2" />Add consumption
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card"><div className="text-xs text-muted-foreground">Opening</div><div className="text-xl font-semibold mt-1">{fmtKg(lot.opening_stock_kg, 2)}</div></div>
        <div className="stat-card"><div className="text-xs text-muted-foreground">Consumed</div><div className="text-xl font-semibold mt-1">{fmtKg(lot.consumed_stock_kg, 2)}</div></div>
        <div className="stat-card"><div className="text-xs text-muted-foreground">Remaining</div><div className="text-xl font-semibold mt-1 text-success">{fmtKg(lot.remaining_stock_kg, 2)}</div></div>
        <div className="stat-card"><div className="text-xs text-muted-foreground">Article</div><div className="text-base font-mono mt-2">{lot.article_no || "—"}</div></div>
      </div>

      <div className="surface p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-lg bg-success/10 text-success flex shrink-0 items-center justify-center">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium">Mass Balance XLSX</div>
              <Badge variant={workbook?.status === "ready" ? "default" : "secondary"} className="capitalize">
                {workbook?.status || "not generated"}
              </Badge>
            </div>
            <div className="mt-1 max-w-full truncate font-mono text-sm text-foreground">
              {workbookFileName}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>TC {lot.transaction_certificates?.tc_number || "-"}</span>
              <span>Shipment {lot.shipments?.shipment_no || "-"}</span>
              <span>Product {lot.normalized_yarn_key || "-"}</span>
              {workbook?.last_generated_at ? <span>Generated {fmtDate(workbook.last_generated_at)}</span> : null}
              {workbook?.row_count ? <span>{workbook.row_count} row{workbook.row_count === 1 ? "" : "s"}</span> : null}
            </div>
            {workbook?.error_message && (
              <div className="text-xs text-destructive mt-1">{workbook.error_message}</div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleWorkbook("download")} disabled={xlsxBusy}>
            <Download className="h-4 w-4 mr-2" />Download
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleWorkbook("regenerate")} disabled={xlsxBusy}>
            <RefreshCw className={`h-4 w-4 mr-2 ${xlsxBusy ? "animate-spin" : ""}`} />Regenerate
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="entries">Consumption ({entries?.length || 0})</TabsTrigger>
          <TabsTrigger value="ledger">Ledger ({ledger?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="surface p-6 mt-4">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            <Info label="Supplier" value={lot.transaction_certificates?.suppliers?.supplier_name || "—"} />
            <Info label="TC number" value={<span className="font-mono">{lot.transaction_certificates?.tc_number}</span>} />
            <Info label="Shipment" value={lot.shipments?.shipment_no || "—"} />
            <Info label="Shipment date" value={fmtDate(lot.shipments?.shipment_date)} />
            <Info label="Product no." value={lot.product_no || "—"} />
            <Info label="Units" value={`${lot.number_of_units || "—"} ${lot.unit_type || ""}`} />
            <Info label="Net weight" value={fmtKg(lot.net_shipping_weight_kg, 3)} />
            <Info label="Certified weight" value={fmtKg(lot.certified_weight_kg, 3)} />
            <Info label="Status" value={<Badge>{lot.status}</Badge>} />
          </dl>
        </TabsContent>
        <TabsContent value="entries" className="surface mt-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Date</th>
                <th className="text-left font-medium px-4 py-3">Customer</th>
                <th className="text-left font-medium px-4 py-3">Invoice</th>
                <th className="text-right font-medium px-4 py-3">Consumed</th>
                <th className="text-right font-medium px-4 py-3">Outward Cert.</th>
                <th className="text-right font-medium px-4 py-3">Loss %</th>
                <th className="text-right font-medium px-4 py-3">Closing</th>
                <th className="text-right font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries?.length ? entries.map((e: any) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">{fmtDate(e.consumption_date)}</td>
                  <td className="px-4 py-3">{e.outward_sales?.customers?.customer_name || e.outward_sales?.customer_name_snapshot || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.outward_sales?.outward_invoice_no || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtKg(e.consumed_weight_kg, 2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtKg(e.outward_certified_weight_kg, 2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.loss_percent ? Number(e.loss_percent).toFixed(2) + "%" : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtKg(e.closing_balance_after_kg, 2)}</td>
                  <td className="px-4 py-3 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete consumption"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                          disabled={deletingEntryId === e.id}
                        >
                          {deletingEntryId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this consumption and restore stock?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the consumption entry, restores {fmtKg(e.consumed_weight_kg, 2)} to this lot, adds a reversal ledger entry, and regenerates the Mass Balance XLSX.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteConsumption(e)} disabled={deletingEntryId === e.id} className="rounded-xl bg-destructive hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No consumption yet on this lot.</td></tr>
              )}
            </tbody>
          </table>
        </TabsContent>
        <TabsContent value="ledger" className="surface mt-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Date</th>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-right font-medium px-4 py-3">In</th>
                <th className="text-right font-medium px-4 py-3">Out</th>
                <th className="text-right font-medium px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ledger?.map((l: any) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">{fmtDate(l.created_at)}</td>
                  <td className="px-4 py-3 capitalize">{l.transaction_type.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-success">{Number(l.qty_in_kg) > 0 ? fmtKg(l.qty_in_kg, 2) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-destructive">{Number(l.qty_out_kg) > 0 ? fmtKg(l.qty_out_kg, 2) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtKg(l.balance_after_kg, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const Info = ({ label, value }: { label: string; value: any }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-1">{value}</dd>
  </div>
);
