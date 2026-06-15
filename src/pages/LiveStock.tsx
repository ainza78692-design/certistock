import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Edit2, Loader2, PackagePlus, Search, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import AdminPinDialog from "@/components/AdminPinDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { fmtDate, fmtKg, normalizeProductKey } from "@/lib/format";
import { buildMonthlyAnalytics, getAvailableYears } from "@/lib/monthAnalytics";

type IncomingStockRow = {
  id: string;
  invoice_no: string;
  yarn_count: string;
  normalized_yarn_key: string | null;
  net_weight_kg: number | string;
  shipment_date: string;
  created_at?: string | null;
};

type FormState = {
  invoice_no: string;
  net_weight_kg: string;
  yarn_count: string;
  shipment_date: string;
};

const emptyForm: FormState = {
  invoice_no: "",
  net_weight_kg: "",
  yarn_count: "",
  shipment_date: "",
};

const searchText = (row: IncomingStockRow) =>
  [
    row.invoice_no,
    row.yarn_count,
    row.normalized_yarn_key,
    row.shipment_date,
  ].filter(Boolean).join(" ").toUpperCase();

export default function LiveStock() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));

  const cid = profile?.company_id;
  const urlQuery = searchParams.get("q") || "";

  useEffect(() => {
    setQ(urlQuery);
  }, [urlQuery]);

  const { data: incoming = [], isLoading } = useQuery({
    queryKey: ["incoming-stock", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) return localApi<IncomingStockRow[]>("/api/incoming-stock");
      const { data, error } = await (supabase as any)
        .from("incoming_stock")
        .select("*")
        .eq("company_id", cid)
        .is("matched_tc_id", null)
        .order("shipment_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: stockAnalyticsRaw } = useQuery({
    queryKey: ["live-stock-analytics", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) {
        return localApi<{ lots: any[]; consumption: any[] }>("/api/dashboard");
      }

      const [lots, consumption] = await Promise.all([
        supabase.from("product_lots")
          .select("opening_stock_kg, certified_weight_kg, shipments(shipment_date)")
          .eq("company_id", cid!),
        supabase.from("consumption_entries")
          .select("consumed_weight_kg, consumption_date")
          .eq("company_id", cid!),
      ]);

      return {
        lots: (lots.data || []).map((lot: any) => ({
          ...lot,
          shipment_date: lot.shipments?.shipment_date || null,
        })),
        consumption: consumption.data || [],
      };
    },
  });

  const normalizedQuery = useMemo(() => {
    const trimmed = q.trim();
    if (!trimmed) return "";
    return normalizeProductKey(trimmed) || trimmed.toUpperCase();
  }, [q]);

  const filtered = useMemo(() => {
    const term = q.trim().toUpperCase();
    const monthFiltered = incoming.filter((row) => {
      const date = String(row.shipment_date || "").slice(0, 10);
      if (!date) return false;
      return date.slice(0, 4) === selectedYear && Number(date.slice(5, 7)) === Number(selectedMonth);
    });
    if (!term) return monthFiltered;
    return monthFiltered.filter((row) => searchText(row).includes(term) || row.normalized_yarn_key === normalizedQuery);
  }, [incoming, normalizedQuery, q, selectedMonth, selectedYear]);

  const availableYears = useMemo(
    () => getAvailableYears({ shipmentLots: stockAnalyticsRaw?.lots || [], consumptions: stockAnalyticsRaw?.consumption || [] }),
    [stockAnalyticsRaw],
  );

  const monthlyAnalytics = useMemo(
    () => buildMonthlyAnalytics({
      shipmentLots: stockAnalyticsRaw?.lots || [],
      consumptions: stockAnalyticsRaw?.consumption || [],
    }, Number(selectedYear)),
    [selectedYear, stockAnalyticsRaw],
  );

  const selectedPoint = useMemo(
    () => monthlyAnalytics.find((point) => point.month === Number(selectedMonth)) || monthlyAnalytics[0],
    [monthlyAnalytics, selectedMonth],
  );

  const totals = useMemo(() => {
    const incomingKg = filtered.reduce((sum, row) => sum + Number(row.net_weight_kg || 0), 0);

    return {
      rows: filtered.length,
      incomingKg,
      receivedKg: selectedPoint?.receivedKg || 0,
      consumedKg: selectedPoint?.consumedKg || 0,
      closingKg: selectedPoint?.closingKg || 0,
    };
  }, [filtered, selectedPoint]);

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.invoice_no.trim() || !form.net_weight_kg || !form.yarn_count.trim() || !form.shipment_date) {
      toast.error("Enter invoice, weight, yarn count and shipment date");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        invoice_no: form.invoice_no.trim(),
        net_weight_kg: Number(form.net_weight_kg),
        yarn_count: form.yarn_count.trim(),
        shipment_date: form.shipment_date,
      };

      if (isLocalBackend) {
        await localApi(editingId ? `/api/incoming-stock/${editingId}` : "/api/incoming-stock", {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        });
      } else if (editingId) {
        const { error } = await (supabase as any)
          .from("incoming_stock")
          .update({
            ...payload,
            normalized_yarn_key: normalizeProductKey(payload.yarn_count) || payload.yarn_count.toUpperCase(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId)
          .eq("company_id", cid);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("incoming_stock").insert({
          company_id: cid,
          ...payload,
          normalized_yarn_key: normalizeProductKey(payload.yarn_count) || payload.yarn_count.toUpperCase(),
        });
        if (error) throw error;
      }

      toast.success(editingId ? "Incoming stock updated" : "Incoming stock added");
      resetForm();
      qc.invalidateQueries({ queryKey: ["incoming-stock"] });
      qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
      qc.invalidateQueries({ queryKey: ["live-stock-analytics"] });
      qc.invalidateQueries({ queryKey: ["global_search"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save incoming stock");
    } finally {
      setSaving(false);
    }
  };

  const edit = (row: IncomingStockRow) => {
    setEditingId(row.id);
    setForm({
      invoice_no: row.invoice_no || "",
      net_weight_kg: String(row.net_weight_kg || ""),
      yarn_count: row.yarn_count || "",
      shipment_date: String(row.shipment_date || "").slice(0, 10),
    });
  };

  const deleteIncomingStock = async (row: IncomingStockRow) => {
    if (!cid) {
      toast.error("No company found for this account.");
      return;
    }

    setDeletingId(row.id);
    try {
      if (isLocalBackend) {
        await localApi(`/api/incoming-stock/${row.id}`, { method: "DELETE" });
      } else {
        const { error } = await (supabase as any)
          .from("incoming_stock")
          .delete()
          .eq("id", row.id)
          .eq("company_id", cid)
          .is("matched_tc_id", null);
        if (error) throw error;
      }

      if (editingId === row.id) resetForm();
      toast.success("Live stock deleted");
      qc.invalidateQueries({ queryKey: ["incoming-stock"] });
      qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
      qc.invalidateQueries({ queryKey: ["live-stock-analytics"] });
      qc.invalidateQueries({ queryKey: ["global_search"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete live stock");
    } finally {
      setDeletingId(null);
    }
  };

  const bulkDeleteIncomingStock = async (pin: string) => {
    if (!filtered.length) {
      toast.error("No live stock rows to delete");
      return;
    }

    setBulkDeleting(true);
    try {
      if (!isLocalBackend) {
        throw new Error("Bulk delete is available only in local backend mode");
      }

      const data = await localApi<{ ok?: boolean; deletedCount?: number; error?: string }>("/api/incoming-stock/delete-all", {
        method: "POST",
        body: JSON.stringify({
          pin,
          ids: filtered.map((row) => row.id),
        }),
      });
      if (!data?.ok) throw new Error(data?.error || "Could not bulk delete live stock");

      if (editingId && filtered.some((row) => row.id === editingId)) resetForm();
      toast.success(`${data.deletedCount || 0} live stock record(s) deleted`);
      setBulkDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ["incoming-stock"] });
      qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
      qc.invalidateQueries({ queryKey: ["live-stock-analytics"] });
      qc.invalidateQueries({ queryKey: ["global_search"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not bulk delete live stock");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Live Stock"
        subtitle="Month-wise stock analysis driven by shipment dates, plus pending incoming invoice records."
        actions={
          <div className="flex items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[120px] rounded-xl">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[140px] rounded-xl">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {monthlyAnalytics.map((point) => (
                  <SelectItem key={point.month} value={String(point.month)}>{point.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLocalBackend ? (
              <Button
                variant="outline"
                className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                disabled={!filtered.length}
                onClick={() => setBulkDeleteOpen(true)}
              >
                Delete All Visible
              </Button>
            ) : null}
          </div>
        }
      />

      <form onSubmit={submit} className="surface p-5 animate-fadeInUp">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1.4fr_1fr_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Invoice No</Label>
            <Input value={form.invoice_no} onChange={(e) => updateForm("invoice_no", e.target.value)} placeholder="AT1492/25-26" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Net Shipping Weight</Label>
            <Input type="number" min="0" step="0.001" value={form.net_weight_kg} onChange={(e) => updateForm("net_weight_kg", e.target.value)} placeholder="1002.32" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Yarn Count</Label>
            <Input value={form.yarn_count} onChange={(e) => updateForm("yarn_count", e.target.value)} placeholder="20/1 SD DTY R-PET" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Shipment Date</Label>
            <DatePicker value={form.shipment_date} onChange={(val) => updateForm("shipment_date", val)} />
          </div>
          <div className="flex gap-2">
            {editingId && (
              <Button type="button" variant="outline" size="icon" onClick={resetForm} aria-label="Cancel edit">
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button type="submit" disabled={saving} className="gap-2 whitespace-nowrap">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              {editingId ? "Save" : "Add Incoming Stock"}
            </Button>
          </div>
        </div>
      </form>

      <div className="surface p-2 mt-5 animate-fadeInUp" style={{ animationDelay: "60ms" }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice or product key like 50D, 70D, 20/1..."
            className="pl-9 border-0 shadow-none focus-visible:ring-0 bg-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {[
          { label: "Pending invoices", value: totals.rows },
          { label: "Stock received", value: fmtKg(totals.receivedKg, 2) },
          { label: "Stock consumed", value: fmtKg(totals.consumedKg, 2) },
          { label: "Stock remaining", value: fmtKg(totals.closingKg, 2) },
        ].map((item, index) => (
          <div key={item.label} className="stat-card animate-fadeInUp" style={{ animationDelay: `${100 + index * 50}ms` }}>
            <div className="text-xs text-muted-foreground">{item.label}</div>
            <div className="text-xl font-bold mt-1 tracking-tight">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="surface overflow-hidden mt-5 animate-fadeInUp" style={{ animationDelay: "140ms" }}>
        <div className="p-5 border-b border-border/50">
          <h3 className="text-sm font-semibold">Month-wise stock analysis</h3>
          <p className="text-xs text-muted-foreground mt-1">Opening, received, consumed, and closing stock for {selectedYear}, based on shipment dates.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th className="text-left">Month</th>
                <th className="text-right">Opening</th>
                <th className="text-right">Received</th>
                <th className="text-right">Consumed</th>
                <th className="text-right">Closing</th>
              </tr>
            </thead>
            <tbody>
              {monthlyAnalytics.map((point) => (
                <tr key={point.month} className={point.month === Number(selectedMonth) ? "bg-primary/[0.04]" : ""}>
                  <td className="font-medium">{point.label}</td>
                  <td className="text-right tabular-nums">{fmtKg(point.openingKg, 2)}</td>
                  <td className="text-right tabular-nums">{fmtKg(point.receivedKg, 2)}</td>
                  <td className="text-right tabular-nums">{fmtKg(point.consumedKg, 2)}</td>
                  <td className="text-right tabular-nums font-semibold">{fmtKg(point.closingKg, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface overflow-hidden mt-5 animate-fadeInUp" style={{ animationDelay: "160ms" }}>
        {isLoading ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : !filtered.length ? (
          <EmptyState
            icon={PackagePlus}
            title={q ? "No matching live stock" : "No live stock yet for this month"}
            description={q ? "Try another invoice number or yarn count." : "Add invoice details as soon as material is bought."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th className="text-left">Invoice No</th>
                  <th className="text-left">Yarn Count</th>
                  <th className="text-left">Key</th>
                  <th className="text-right">Net Weight</th>
                  <th className="text-left">Shipment Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isDeleting = deletingId === row.id;
                  return (
                    <tr key={row.id}>
                      <td className="font-mono text-xs whitespace-nowrap">{row.invoice_no}</td>
                      <td>
                        <span className="block max-w-[260px] truncate" title={row.yarn_count}>{row.yarn_count}</span>
                      </td>
                      <td>
                        <Badge className="bg-primary/10 text-primary border-0">{row.normalized_yarn_key || "Unmapped"}</Badge>
                      </td>
                      <td className="text-right tabular-nums font-semibold whitespace-nowrap">{fmtKg(Number(row.net_weight_kg), 2)}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{fmtDate(row.shipment_date)}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => edit(row)} aria-label="Edit live stock" disabled={isDeleting}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                                aria-label="Delete live stock"
                                disabled={isDeleting}
                              >
                                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-2xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this live stock?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This permanently removes pending invoice {row.invoice_no} for {row.normalized_yarn_key || row.yarn_count} ({fmtKg(Number(row.net_weight_kg), 2)}). Certified stock and TC records are not affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteIncomingStock(row)}
                                  disabled={isDeleting}
                                  className="rounded-xl bg-destructive hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdminPinDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete all visible live stock?"
        description={`This will permanently delete ${filtered.length} visible live stock record(s). Enter Nehal's admin PIN to continue.`}
        confirmLabel={bulkDeleting ? "Deleting..." : "Delete all"}
        busy={bulkDeleting}
        onConfirm={bulkDeleteIncomingStock}
      />
    </div>
  );
}
