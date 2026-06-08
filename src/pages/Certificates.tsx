import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { fmtKg, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type CertificateRow = {
  id: string;
  tc_number: string;
  issue_date: string | null;
  certified_weight_kg: number | null;
  standard: string;
  review_status: string;
  suppliers?: { supplier_name?: string | null } | null;
};

type LotForDelete = {
  id: string;
  consumed_stock_kg: number | null;
};

/** Extract just the company name from the raw supplier field */
const displaySupplierName = (name?: string | null): string => {
  const cleaned = (name || "—").replace(/\s+/g, " ").trim();
  const markers = [" SC Number:", " Textile Exchange-ID", " Buyer of", " 3.", " 4. Gross", " Block No", " Plot No"];
  const cutAt = markers
    .map((marker) => cleaned.indexOf(marker))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0];
  return cutAt ? cleaned.slice(0, cutAt).trim() : cleaned;
};

/** Shorten long standard names */
const displayStandard = (std: string | null): string => {
  if (!std) return "—";
  const map: Record<string, string> = {
    "GLOBAL RECYCLED STANDARD": "GRS",
    "Global Recycled Standard (GRS)": "GRS",
    "ORGANIC CONTENT STANDARD": "OCS",
    "RECYCLED CLAIM STANDARD": "RCS",
  };
  return map[std] || std;
};

export default function Certificates() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["tcs", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      if (isLocalBackend) return localApi<CertificateRow[]>("/api/certificates");

      const { data } = await supabase.from("transaction_certificates")
        .select("*, suppliers(supplier_name)")
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const deleteCertificate = async (certificate: CertificateRow) => {
    if (!profile?.company_id) {
      toast.error("No company found for this account.");
      return;
    }

    setDeletingId(certificate.id);
    try {
      if (isLocalBackend) {
        await localApi(`/api/certificates/${certificate.id}`, { method: "DELETE" });
        toast.success("Certificate deleted");
        queryClient.invalidateQueries({ queryKey: ["tcs", profile.company_id] });
        queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
        return;
      }

      const { data: lots, error: lotsError } = await supabase
        .from("product_lots")
        .select("id, consumed_stock_kg")
        .eq("company_id", profile.company_id)
        .eq("transaction_certificate_id", certificate.id);

      if (lotsError) throw lotsError;

      const lotRows = (lots || []) as LotForDelete[];
      const consumedLot = lotRows.find((lot) => Number(lot.consumed_stock_kg || 0) > 0);
      if (consumedLot) {
        toast.error("Cannot delete this certificate because stock has already been consumed.");
        return;
      }

      const lotIds = lotRows.map((lot) => lot.id);
      if (lotIds.length > 0) {
        const { count, error: consumptionError } = await supabase
          .from("consumption_entries")
          .select("id", { count: "exact", head: true })
          .eq("company_id", profile.company_id)
          .in("product_lot_id", lotIds);

        if (consumptionError) throw consumptionError;
        if ((count || 0) > 0) {
          toast.error("Cannot delete this certificate because stock has already been consumed.");
          return;
        }

        const { error: ledgerError } = await supabase
          .from("stock_ledger")
          .delete()
          .eq("company_id", profile.company_id)
          .in("product_lot_id", lotIds);

        if (ledgerError) throw ledgerError;

        const { error: lotError } = await supabase
          .from("product_lots")
          .delete()
          .eq("company_id", profile.company_id)
          .in("id", lotIds);

        if (lotError) throw lotError;
      }

      const { error: certificateError } = await supabase
        .from("transaction_certificates")
        .delete()
        .eq("company_id", profile.company_id)
        .eq("id", certificate.id);

      if (certificateError) throw certificateError;

      toast.success("Certificate deleted");
      queryClient.invalidateQueries({ queryKey: ["tcs", profile.company_id] });
      queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete certificate.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Transaction certificates" subtitle="All TCs ingested into your stock ledger." />
      <div className="surface overflow-hidden animate-fadeInUp">
        {!data?.length ? (
          <EmptyState
            icon={FileText}
            title="No certificates yet"
            description="Upload PDFs and approve extractions to populate this list."
            action={{ label: "Upload PDFs", onClick: () => navigate("/upload") }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th className="text-left w-[160px]">TC number</th>
                  <th className="text-left">Supplier</th>
                  <th className="text-left w-[100px]">Issue date</th>
                  <th className="text-right w-[110px]">Certified</th>
                  <th className="text-left w-[80px]">Standard</th>
                  <th className="text-left w-[100px]">Status</th>
                  <th className="text-right w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((t: CertificateRow) => {
                  const isDeleting = deletingId === t.id;
                  const supplierName = displaySupplierName(t.suppliers?.supplier_name);

                  return (
                    <tr
                      key={t.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/lots?q=${t.tc_number}`)}
                    >
                      <td className="font-mono text-xs whitespace-nowrap">{t.tc_number}</td>
                      <td>
                        <span className="block truncate max-w-[320px]" title={supplierName}>
                          {supplierName}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-muted-foreground">{fmtDate(t.issue_date)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{fmtKg(t.certified_weight_kg, 2)}</td>
                      <td className="whitespace-nowrap">
                        <span title={t.standard}>{displayStandard(t.standard)}</span>
                      </td>
                      <td>
                        <Badge variant="secondary" className="capitalize bg-muted/50 border-0 font-medium whitespace-nowrap text-xs">{t.review_status?.replace("_", " ")}</Badge>
                      </td>
                      <td className="text-right" onClick={(event) => event.stopPropagation()}>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete certificate"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                              disabled={isDeleting}
                            >
                              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this certificate?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the certificate, its unused stock lots, and inward ledger rows. If any stock from this certificate was consumed, deletion will be blocked.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteCertificate(t)} disabled={isDeleting} className="rounded-xl bg-destructive hover:bg-destructive/90">
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
