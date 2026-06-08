import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { fmtKg, fmtDate } from "@/lib/format";
import { Loader2, Search, ShoppingCart, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePreset, getDateRange, matchesDateRange } from "@/lib/dateFilters";
import { toast } from "sonner";
import { exportToXlsx } from "@/lib/exportUtils";
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

export default function Consumption() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["consumption", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      if (isLocalBackend) return localApi<any[]>("/api/consumption");

      const { data } = await supabase.from("consumption_entries")
        .select("*, product_lots(normalized_yarn_key, article_no, shipments(shipment_no, shipment_date), transaction_certificates(tc_number)), outward_sales(outward_invoice_no, customer_name_snapshot)")
        .eq("company_id", profile!.company_id!).order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const range = getDateRange(datePreset, customFrom, customTo);
    const search = q.toUpperCase().trim();
    return (data || []).filter((entry: any) => {
      if (!matchesDateRange(entry.consumption_date, range)) return false;
      if (!search) return true;
      return (
        (entry.product_lots?.normalized_yarn_key || "").toUpperCase().includes(search) ||
        (entry.product_lots?.article_no || "").toUpperCase().includes(search) ||
        (entry.product_lots?.shipments?.shipment_no || "").toUpperCase().includes(search) ||
        (entry.product_lots?.transaction_certificates?.tc_number || "").toUpperCase().includes(search) ||
        (entry.outward_sales?.customer_name_snapshot || "").toUpperCase().includes(search) ||
        (entry.outward_sales?.outward_invoice_no || "").toUpperCase().includes(search)
      );
    });
  }, [customFrom, customTo, data, datePreset, q]);

  const deleteConsumption = async (entry: any) => {
    if (!profile?.company_id) return;
    setDeletingId(entry.id);
    try {
      if (isLocalBackend) {
        const data = await localApi<any>(`/api/consumption/${entry.id}?reason=${encodeURIComponent("Deleted from Consumption page")}`, {
          method: "DELETE",
        });
        if (!data?.ok) throw new Error(data?.error || "Could not delete consumption");

        if (data.xlsx?.status === "ready") {
          toast.success("Consumption deleted, stock restored, and Mass Balance XLSX updated");
        } else {
          toast.warning("Consumption deleted and stock restored, but XLSX needs regeneration");
        }

        queryClient.invalidateQueries({ queryKey: ["consumption", profile.company_id] });
        queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
        if (data.productLotId) {
          queryClient.invalidateQueries({ queryKey: ["lot", data.productLotId] });
          queryClient.invalidateQueries({ queryKey: ["lot-entries", data.productLotId] });
          queryClient.invalidateQueries({ queryKey: ["lot-ledger", data.productLotId] });
          queryClient.invalidateQueries({ queryKey: ["mass-balance-workbook", data.productLotId] });
        }
        return;
      }

      const { data, error } = await supabase.functions.invoke("delete-consumption", {
        body: {
          consumptionEntryId: entry.id,
          reason: "Deleted from Consumption page",
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Could not delete consumption");

      if (data.xlsx?.status === "ready") {
        toast.success("Consumption deleted, stock restored, and Mass Balance XLSX updated");
      } else {
        toast.warning("Consumption deleted and stock restored, but XLSX needs regeneration");
      }

      queryClient.invalidateQueries({ queryKey: ["consumption", profile.company_id] });
      queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
      queryClient.invalidateQueries({ queryKey: ["lot", data.productLotId] });
      queryClient.invalidateQueries({ queryKey: ["lot-entries", data.productLotId] });
      queryClient.invalidateQueries({ queryKey: ["lot-ledger", data.productLotId] });
      queryClient.invalidateQueries({ queryKey: ["mass-balance-workbook", data.productLotId] });
    } catch (error: any) {
      toast.error(error.message || "Could not delete consumption");
    } finally {
      setDeletingId(null);
    }
  };

  const exportExcel = () => {
    if (!filtered || !filtered.length) return;
    
    const formattedData = filtered.map((c: any) => ({
      "Date": fmtDate(c.consumption_date),
      "Product": c.product_lots?.normalized_yarn_key || "—",
      "Article No": c.product_lots?.article_no || "—",
      "Consumed (kg)": c.consumed_weight_kg,
      "Customer": c.outward_sales?.customer_name_snapshot || "—",
      "Invoice No": c.outward_sales?.outward_invoice_no || "—",
      "Lot Shipment No": c.product_lots?.shipments?.shipment_no || "—",
      "Lot TC No": c.product_lots?.transaction_certificates?.tc_number || "—"
    }));

    exportToXlsx("Consumption_Export", formattedData);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Consumption and sales" subtitle="Every outward sale and the certified lot it deducted from."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportExcel} className="rounded-xl gap-2 border-border/60 hover:border-primary/25 hover:bg-primary/[0.02] transition-all duration-300">
              <ShoppingCart className="h-4 w-4" />Export Excel
            </Button>
            <Button variant="outline" onClick={() => navigate("/consumption/bulk")} className="rounded-xl gap-2 border-border/60 hover:border-primary/25 hover:bg-primary/[0.02] transition-all duration-300">
              <Upload className="h-4 w-4" />Bulk Upload
            </Button>
            <Button onClick={() => navigate("/consumption/new")} className="rounded-xl gap-2 shadow-sm hover:shadow-md transition-all duration-300">
              <ShoppingCart className="h-4 w-4" />New consumption
            </Button>
          </div>
        } 
      />

      <div className="surface p-2 mb-4 animate-fadeInUp">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_160px_150px_150px] gap-2">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search 50D, shipment, TC, customer, invoice..."
              className="pl-9 border-0 shadow-none focus-visible:ring-0 bg-transparent" />
          </div>
          <Select value={datePreset} onValueChange={(value) => setDatePreset(value as DatePreset)}>
            <SelectTrigger className="rounded-xl border-0 bg-muted/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="last7">Last 7 days</SelectItem>
              <SelectItem value="thisMonth">This month</SelectItem>
              <SelectItem value="lastMonth">Last month</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); setDatePreset("custom"); }} className="border-0 bg-muted/40" />
          <Input type="date" value={customTo} onChange={(event) => { setCustomTo(event.target.value); setDatePreset("custom"); }} className="border-0 bg-muted/40" />
        </div>
      </div>

      <div className="surface overflow-hidden animate-fadeInUp">
        {!filtered.length ? (
          <EmptyState icon={ShoppingCart} title="No consumption recorded" description="Record your first outward sale to deduct from a certified lot."
            action={{ label: "Record consumption", onClick: () => navigate("/consumption/new") }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1160px]">
              <thead>
                <tr>
                  <th className="text-left w-[100px]">Date</th>
                  <th className="text-left w-[180px]">Customer</th>
                  <th className="text-left w-[130px]">Invoice</th>
                  <th className="text-left w-[120px]">Product</th>
                  <th className="text-left w-[110px]">Shipment</th>
                  <th className="text-left w-[110px]">Ship date</th>
                  <th className="text-left w-[140px]">From TC</th>
                  <th className="text-right w-[100px]">Consumed</th>
                  <th className="text-right w-[100px]">Outward cert.</th>
                  <th className="text-right w-[80px]">Loss %</th>
                  <th className="text-right w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e: any) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-muted-foreground">{fmtDate(e.consumption_date)}</td>
                    <td>
                      <span className="block truncate max-w-[170px]" title={e.outward_sales?.customer_name_snapshot}>
                        {e.outward_sales?.customer_name_snapshot || "—"}
                      </span>
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">{e.outward_sales?.outward_invoice_no || "—"}</td>
                    <td className="font-medium whitespace-nowrap">{e.product_lots?.normalized_yarn_key || "—"}</td>
                    <td className="font-mono text-xs whitespace-nowrap">{e.product_lots?.shipments?.shipment_no || "—"}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{fmtDate(e.product_lots?.shipments?.shipment_date)}</td>
                    <td className="font-mono text-xs whitespace-nowrap">{e.product_lots?.transaction_certificates?.tc_number || "—"}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">{fmtKg(e.consumed_weight_kg, 2)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">{fmtKg(e.outward_certified_weight_kg, 2)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">{e.loss_percent ? Number(e.loss_percent).toFixed(2)+"%" : "—"}</td>
                    <td className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete consumption"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                            disabled={deletingId === e.id}
                          >
                            {deletingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this consumption and restore stock?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the consumption entry, restores {fmtKg(e.consumed_weight_kg, 2)} to the selected lot, adds a reversal ledger entry, and regenerates the Mass Balance XLSX.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteConsumption(e)} disabled={deletingId === e.id} className="rounded-xl bg-destructive hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
