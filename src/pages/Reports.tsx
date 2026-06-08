import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { fmtKg } from "@/lib/format";
import { Download } from "lucide-react";
import { exportToXlsx } from "@/lib/exportUtils";

export default function Reports() {
  const { profile } = useAuth();
  const cid = profile?.company_id;

  const { data } = useQuery({
    queryKey: ["reports-stock", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) {
        const lots = await localApi<any[]>("/api/stock-lots");
        const byKey: Record<string, any> = {};
        (lots || []).forEach((l: any) => {
          const k = l.normalized_yarn_key || "Unmapped";
          if (!byKey[k]) byKey[k] = { key: k, certified: 0, consumed: 0, remaining: 0 };
          byKey[k].certified += Number(l.certified_weight_kg || 0);
          byKey[k].consumed += Number(l.consumed_stock_kg || 0);
          byKey[k].remaining += Number(l.remaining_stock_kg || 0);
        });
        return Object.values(byKey);
      }

      const { data: lots } = await supabase.from("product_lots")
        .select("normalized_yarn_key, certified_weight_kg, consumed_stock_kg, remaining_stock_kg, transaction_certificates(tc_number, suppliers(supplier_name))")
        .eq("company_id", cid!);
      const byKey: Record<string, any> = {};
      (lots || []).forEach((l: any) => {
        const k = l.normalized_yarn_key || "Unmapped";
        if (!byKey[k]) byKey[k] = { key: k, certified: 0, consumed: 0, remaining: 0 };
        byKey[k].certified += Number(l.certified_weight_kg || 0);
        byKey[k].consumed += Number(l.consumed_stock_kg || 0);
        byKey[k].remaining += Number(l.remaining_stock_kg || 0);
      });
      return Object.values(byKey);
    },
  });

  const exportExcel = () => {
    if (!data) return;
    const formattedData = data.map((r: any) => ({
      "Product": r.key,
      "Certified (kg)": r.certified,
      "Consumed (kg)": r.consumed,
      "Remaining (kg)": r.remaining
    }));
    exportToXlsx("Product_Stock_Report", formattedData);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Reports" subtitle="Stock balance and consumption summaries."
        actions={
          <Button variant="outline" onClick={exportExcel} className="rounded-xl gap-2 group border-border/60 hover:border-primary/25 hover:bg-primary/[0.02] transition-all duration-300">
            <Download className="h-4 w-4 group-hover:translate-y-0.5 transition-transform duration-300" />Export Excel
          </Button>
        } />
      <div className="surface overflow-hidden animate-fadeInUp">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[550px]">
            <thead>
              <tr>
                <th className="text-left">Product</th>
                <th className="text-right w-[130px]">Certified</th>
                <th className="text-right w-[130px]">Consumed</th>
                <th className="text-right w-[130px]">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((r: any) => (
                <tr key={r.key}>
                  <td className="font-medium whitespace-nowrap">{r.key}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{fmtKg(r.certified, 2)}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{fmtKg(r.consumed, 2)}</td>
                  <td className="text-right tabular-nums whitespace-nowrap font-semibold">{fmtKg(r.remaining, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
