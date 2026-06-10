import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Package, ShoppingCart, Trash2 } from "lucide-react";
import { fmtDate, fmtKg } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { exportToXlsx } from "@/lib/exportUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePreset, getDateRange, matchesDateRange } from "@/lib/dateFilters";
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

type StockLotRow = {
  id: string;
  normalized_yarn_key: string | null;
  article_no: string | null;
  additional_info_raw: string | null;
  certified_weight_kg: number | string | null;
  consumed_stock_kg: number | string | null;
  remaining_stock_kg: number | string | null;
  needs_manual_review: boolean | null;
  status: string | null;
  transaction_certificates?: {
    tc_number?: string | null;
    suppliers?: { supplier_name?: string | null } | null;
  } | null;
  shipments?: {
    shipment_no?: string | null;
    shipment_date?: string | null;
  } | null;
};

/** Extract just the company name, strip addresses, SC numbers etc. */
const cleanSupplier = (name?: string | null): string => {
  const raw = (name || "—").replace(/\s+/g, " ").trim();
  const markers = [" SC Number:", " Textile Exchange-ID", " Buyer of", " 3.", " 4. Gross", " Block No", " Plot No", " No."];
  const cutAt = markers
    .map((m) => raw.indexOf(m))
    .filter((i) => i > 0)
    .sort((a, b) => a - b)[0];
  return cutAt ? raw.slice(0, cutAt).trim() : raw;
};

export default function StockLots() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [q, setQ] = useState(params.get("q") || "");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  useEffect(() => { setQ(params.get("q") || ""); }, [params]);

  const { data: lots, isLoading } = useQuery({
    queryKey: ["lots", profile?.company_id, q, datePreset, customFrom, customTo],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const range = getDateRange(datePreset, customFrom, customTo);
      if (isLocalBackend) {
        const data = await localApi<StockLotRow[]>("/api/stock-lots");
        const all = (data || []).filter((lot: StockLotRow) => matchesDateRange(lot.shipments?.shipment_date, range));
        if (!q.trim()) return all;
        const s = q.toUpperCase().trim();
        return all.filter((l: StockLotRow) => {
          return (
            (l.normalized_yarn_key || "").toUpperCase().includes(s) ||
            (l.article_no || "").toUpperCase().includes(s) ||
            (l.additional_info_raw || "").toUpperCase().includes(s) ||
            (l.shipments?.shipment_no || "").toUpperCase().includes(s) ||
            (l.transaction_certificates?.tc_number || "").toUpperCase().includes(s) ||
            (l.transaction_certificates?.suppliers?.supplier_name || "").toUpperCase().includes(s)
          );
        });
      }

      const query = supabase.from("product_lots")
        .select("*, transaction_certificates(tc_number, supplier_id, suppliers(supplier_name)), shipments(shipment_no, shipment_date)")
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false });
      const { data } = await query;
      const all = (data || []).filter((lot: StockLotRow) => matchesDateRange(lot.shipments?.shipment_date, range));
      if (!q.trim()) return all;
      const s = q.toUpperCase().trim();
      return all.filter((l: StockLotRow) => {
        return (
          (l.normalized_yarn_key || "").toUpperCase().includes(s) ||
          (l.article_no || "").toUpperCase().includes(s) ||
          (l.additional_info_raw || "").toUpperCase().includes(s) ||
          (l.shipments?.shipment_no || "").toUpperCase().includes(s) ||
          (l.transaction_certificates?.tc_number || "").toUpperCase().includes(s) ||
          (l.transaction_certificates?.suppliers?.supplier_name || "").toUpperCase().includes(s)
        );
      });
    },
  });

  const totals = (lots || []).reduce((acc, l: StockLotRow) => ({
    cert: acc.cert + Number(l.certified_weight_kg || 0),
    rem: acc.rem + Number(l.remaining_stock_kg || 0),
    cons: acc.cons + Number(l.consumed_stock_kg || 0),
  }), { cert: 0, rem: 0, cons: 0 });

  const getVisibleLots = () => {
    if (!lots || !lots.length) return [];
    const dataToExport = q.trim() 
      ? lots.filter((l: StockLotRow) => {
          const s = q.toUpperCase().trim();
          return (
            (l.normalized_yarn_key || "").toUpperCase().includes(s) ||
            (l.article_no || "").toUpperCase().includes(s) ||
            (l.additional_info_raw || "").toUpperCase().includes(s) ||
            (l.shipments?.shipment_no || "").toUpperCase().includes(s) ||
            (l.transaction_certificates?.tc_number || "").toUpperCase().includes(s) ||
            (l.transaction_certificates?.suppliers?.supplier_name || "").toUpperCase().includes(s)
          );
        })
      : lots;

    return dataToExport;
  };

  const exportExcel = () => {
    const dataToExport = getVisibleLots();
    if (!dataToExport || !dataToExport.length) return;

    const formattedData = dataToExport.map((l: StockLotRow) => ({
      "Product": l.normalized_yarn_key || "—",
      "Article No": l.article_no || "—",
      "Additional Info": l.additional_info_raw || "—",
      "TC Number": l.transaction_certificates?.tc_number || "—",
      "Supplier": cleanSupplier(l.transaction_certificates?.suppliers?.supplier_name),
      "Shipment No": l.shipments?.shipment_no || "—",
      "Shipment Date": fmtDate(l.shipments?.shipment_date),
      "Certified (kg)": Number(l.certified_weight_kg || 0),
      "Consumed (kg)": Number(l.consumed_stock_kg || 0),
      "Remaining (kg)": Number(l.remaining_stock_kg || 0),
      "Status": l.status,
      "Needs Review": l.needs_manual_review ? "Yes" : "No"
    }));

    exportToXlsx("Stock_Lots_Export", formattedData);
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(q ? { q } : {});
  };

  const deleteLot = async (lot: StockLotRow) => {
    if (!profile?.company_id) {
      toast.error("No company found for this account.");
      return;
    }

    if (Number(lot.consumed_stock_kg || 0) > 0) {
      toast.error("Cannot delete a stock lot after consumption is recorded.");
      return;
    }

    setDeletingId(lot.id);
    try {
      if (isLocalBackend) {
        await localApi(`/api/stock-lots/${lot.id}`, { method: "DELETE" });
        toast.success("Stock lot deleted");
        queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
        return;
      }

      const { count, error: countError } = await supabase
        .from("consumption_entries")
        .select("id", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .eq("product_lot_id", lot.id);

      if (countError) throw countError;
      if ((count || 0) > 0) {
        toast.error("Cannot delete a stock lot after consumption is recorded.");
        return;
      }

      const { error: ledgerError } = await supabase
        .from("stock_ledger")
        .delete()
        .eq("company_id", profile.company_id)
        .eq("product_lot_id", lot.id);

      if (ledgerError) throw ledgerError;

      const { error: lotError } = await supabase
        .from("product_lots")
        .delete()
        .eq("company_id", profile.company_id)
        .eq("id", lot.id);

      if (lotError) throw lotError;

      toast.success("Stock lot deleted");
      queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete stock lot.");
    } finally {
      setDeletingId(null);
    }
  };

  const visibleLots = getVisibleLots() || [];
  const safeToDelete = visibleLots.filter(l => Number(l.consumed_stock_kg || 0) === 0);
  const consumedLotsCount = visibleLots.length - safeToDelete.length;

  const handleBulkDelete = async () => {
    if (!profile?.company_id || safeToDelete.length === 0) return;
    setIsBulkDeleting(true);

    try {
      if (isLocalBackend) {
        await localApi("/api/stock-lots", { 
          method: "DELETE",
          body: JSON.stringify({ ids: safeToDelete.map(l => l.id) })
        });
        toast.success(`Deleted ${safeToDelete.length} stock lots`);
        queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
      } else {
        // Find safe lots by checking consumption_entries
        const { data: consumptions } = await supabase
          .from("consumption_entries")
          .select("product_lot_id")
          .eq("company_id", profile.company_id)
          .in("product_lot_id", safeToDelete.map(l => l.id));
        
        const consumedIds = new Set((consumptions || []).map(c => c.product_lot_id));
        const finalSafeIds = safeToDelete.filter(l => !consumedIds.has(l.id)).map(l => l.id);

        if (finalSafeIds.length === 0) {
          toast.error("No safe lots left to delete.");
          return;
        }

        await supabase
          .from("stock_ledger")
          .delete()
          .eq("company_id", profile.company_id)
          .in("product_lot_id", finalSafeIds);

        await supabase
          .from("product_lots")
          .delete()
          .eq("company_id", profile.company_id)
          .in("id", finalSafeIds);

        toast.success(`Deleted ${finalSafeIds.length} stock lots`);
        queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk delete failed");
    } finally {
      setIsBulkDeleting(false);
      setShowBulkDialog(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Stock lots"
        subtitle="Live remaining stock by product key, certificate, and supplier."
        actions={
          <div className="flex items-center gap-2">
            <AlertDialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="rounded-xl gap-2 border-border/60 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive transition-all duration-300" disabled={visibleLots.length === 0}>
                  <Trash2 className="h-4 w-4" />Bulk Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Bulk Delete Stock Lots</AlertDialogTitle>
                  <AlertDialogDescription>
                    You are about to delete <strong>{safeToDelete.length}</strong> empty stock lots.
                    {consumedLotsCount > 0 && (
                      <span className="block mt-2 text-warning font-medium">
                        {consumedLotsCount} consumed lot(s) will be skipped and protected.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl" disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
                    disabled={safeToDelete.length === 0 || isBulkDeleting}
                    className="rounded-xl bg-destructive hover:bg-destructive/90"
                  >
                    {isBulkDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Delete {safeToDelete.length} Lots
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" onClick={exportExcel} className="rounded-xl gap-2 border-border/60 hover:border-primary/25 hover:bg-primary/[0.02] transition-all duration-300">
              <Package className="h-4 w-4" />Export Excel
            </Button>
            <Button onClick={() => navigate("/consumption/new")} className="rounded-xl gap-2 shadow-sm hover:shadow-md transition-all duration-300">
              <ShoppingCart className="h-4 w-4" />New consumption
            </Button>
          </div>
        }
      />

      <form onSubmit={onSearch} className="surface p-2 mb-4 animate-fadeInUp">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_170px_150px_150px] gap-2">
          <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 50D, 70D, IDF-25-792887, supplier, article…"
            className="pl-9 border-0 shadow-none focus-visible:ring-0 bg-transparent" />
          </div>
          <Select value={datePreset} onValueChange={(value) => setDatePreset(value as DatePreset)}>
            <SelectTrigger className="rounded-xl border-0 bg-muted/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shipment dates</SelectItem>
              <SelectItem value="last7">Last 7 days</SelectItem>
              <SelectItem value="thisMonth">This month</SelectItem>
              <SelectItem value="lastMonth">Last month</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); setDatePreset("custom"); }} className="border-0 bg-muted/40" />
          <Input type="date" value={customTo} onChange={(event) => { setCustomTo(event.target.value); setDatePreset("custom"); }} className="border-0 bg-muted/40" />
        </div>
      </form>

      {q && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: "Matched lots", value: lots?.length ?? 0 },
            { label: "Total remaining", value: fmtKg(totals.rem, 2) },
            { label: "Total consumed", value: fmtKg(totals.cons, 2) },
          ].map((s, i) => (
            <div key={s.label} className="stat-card animate-fadeInUp" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xl font-bold mt-1 tracking-tight">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="surface overflow-hidden animate-fadeInUp" style={{ animationDelay: "120ms" }}>
        {isLoading ? (
          <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : !lots?.length ? (
          <EmptyState icon={Package}
            title={q ? "No matching stock found" : "No stock lots yet"}
            description={q ? "Try another product key or add aliases in product master." : "Upload a transaction certificate to create your first lots."}
            action={!q ? { label: "Upload TC", onClick: () => navigate("/upload") } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1050px]">
              <thead>
                <tr>
                  <th className="text-left w-[200px]">Product</th>
                  <th className="text-left w-[110px]">Shipment</th>
                  <th className="text-left w-[120px]">Ship date</th>
                  <th className="text-left w-[130px]">TC no.</th>
                  <th className="text-left w-[180px]">Supplier</th>
                  <th className="text-left w-[100px]">Article</th>
                  <th className="text-right w-[100px]">Certified</th>
                  <th className="text-right w-[100px]">Consumed</th>
                  <th className="text-right w-[100px]">Remaining</th>
                  <th className="text-left w-[90px]">Status</th>
                  <th className="text-right w-[50px]"></th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l: StockLotRow) => {
                  const hasConsumption = Number(l.consumed_stock_kg || 0) > 0;
                  const isDeleting = deletingId === l.id;
                  const supplier = cleanSupplier(l.transaction_certificates?.suppliers?.supplier_name);

                  return (
                  <tr key={l.id} onClick={() => navigate(`/lots/${l.id}`)}
                    className="cursor-pointer">
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium whitespace-nowrap">{l.normalized_yarn_key || "—"}</span>
                        {l.needs_manual_review && <Badge variant="outline" className="text-[10px] border-warning/40 text-warning shrink-0">review</Badge>}
                      </div>
                      {l.additional_info_raw && (
                        <div className="text-xs text-muted-foreground truncate max-w-[190px] mt-0.5" title={l.additional_info_raw}>{l.additional_info_raw}</div>
                      )}
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">{l.shipments?.shipment_no || "—"}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{fmtDate(l.shipments?.shipment_date)}</td>
                    <td className="font-mono text-xs whitespace-nowrap">{l.transaction_certificates?.tc_number || "—"}</td>
                    <td>
                      <span className="block truncate max-w-[170px]" title={supplier}>{supplier}</span>
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">{l.article_no || "—"}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">{fmtKg(Number(l.certified_weight_kg), 2)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">{fmtKg(Number(l.consumed_stock_kg), 2)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap font-semibold">{fmtKg(Number(l.remaining_stock_kg), 2)}</td>
                    <td><StatusBadge lot={l} /></td>
                    <td className="text-right" onClick={(event) => event.stopPropagation()}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete stock lot"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                            disabled={isDeleting}
                          >
                            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this stock lot?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {hasConsumption
                                ? "This lot already has consumption recorded, so it cannot be deleted."
                                : "This will remove the stock lot and its inward ledger row."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteLot(l)}
                              disabled={hasConsumption || isDeleting}
                              className="rounded-xl bg-destructive hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ lot }: { lot: StockLotRow }) {
  const rem = Number(lot.remaining_stock_kg);
  if (lot.status === "exhausted" || rem <= 0)
    return <Badge variant="secondary" className="text-xs text-muted-foreground bg-muted/50 border-0 font-medium whitespace-nowrap">Exhausted</Badge>;
  if (rem < 100)
    return <Badge className="text-xs bg-warning/10 text-warning border-0 font-medium whitespace-nowrap">Low stock</Badge>;
  return <Badge className="text-xs bg-success/10 text-success border-0 font-medium whitespace-nowrap">Active</Badge>;
}
