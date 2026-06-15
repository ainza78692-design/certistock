import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);

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
        queryClient.invalidateQueries({ queryKey: ["suppliers", profile.company_id] });
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
      queryClient.invalidateQueries({ queryKey: ["suppliers", profile.company_id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete certificate.");
    } finally {
      setDeletingId(null);
    }
  };

  const visibleCertificates = data || [];
  const selectedCertificates = useMemo(
    () => visibleCertificates.filter((certificate) => selectedIds.has(certificate.id)),
    [selectedIds, visibleCertificates],
  );

  const isAllVisibleSelected = visibleCertificates.length > 0
    && visibleCertificates.every((certificate) => selectedIds.has(certificate.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(visibleCertificates.map((certificate) => certificate.id)));
      return;
    }
    setSelectedIds(new Set());
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const handleBulkDelete = async () => {
    if (!profile?.company_id || selectedCertificates.length === 0) return;

    setIsBulkDeleting(true);
    try {
      if (isLocalBackend) {
        const result = await localApi<{ deletedCount: number; blockedCount: number }>("/api/certificates", {
          method: "DELETE",
          body: JSON.stringify({ ids: selectedCertificates.map((certificate) => certificate.id) }),
        });

        setSelectedIds(new Set());
        queryClient.invalidateQueries({ queryKey: ["tcs", profile.company_id] });
        queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
        queryClient.invalidateQueries({ queryKey: ["suppliers", profile.company_id] });

        if (result.blockedCount > 0) {
          toast.success(`Deleted ${result.deletedCount} certificates. ${result.blockedCount} consumed certificate(s) were skipped.`);
        } else {
          toast.success(`Deleted ${result.deletedCount} certificates`);
        }
        return;
      }

      let deletedCount = 0;
      let blockedCount = 0;

      for (const certificate of selectedCertificates) {
        const { count, error } = await supabase
          .from("consumption_entries")
          .select("id", { count: "exact", head: true })
          .eq("company_id", profile.company_id)
          .in(
            "product_lot_id",
            (
              await supabase
                .from("product_lots")
                .select("id")
                .eq("company_id", profile.company_id)
                .eq("transaction_certificate_id", certificate.id)
            ).data?.map((row) => row.id) || ["00000000-0000-0000-0000-000000000000"],
          );

        if (error || (count || 0) > 0) {
          blockedCount += 1;
          continue;
        }

        const lots = await supabase
          .from("product_lots")
          .select("id")
          .eq("company_id", profile.company_id)
          .eq("transaction_certificate_id", certificate.id);

        const lotIds = lots.data?.map((row) => row.id) || [];
        if (lotIds.length > 0) {
          await supabase
            .from("stock_ledger")
            .delete()
            .eq("company_id", profile.company_id)
            .in("product_lot_id", lotIds);
        }

        const { error: certificateError } = await supabase
          .from("transaction_certificates")
          .delete()
          .eq("company_id", profile.company_id)
          .eq("id", certificate.id);

        if (!certificateError) deletedCount += 1;
      }

      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["tcs", profile.company_id] });
      queryClient.invalidateQueries({ queryKey: ["lots", profile.company_id] });
      queryClient.invalidateQueries({ queryKey: ["suppliers", profile.company_id] });

      if (blockedCount > 0) {
        toast.success(`Deleted ${deletedCount} certificates. ${blockedCount} consumed certificate(s) were skipped.`);
      } else {
        toast.success(`Deleted ${deletedCount} certificates`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete certificates.");
    } finally {
      setIsBulkDeleting(false);
      setShowBulkDialog(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Transaction certificates"
        subtitle="All TCs ingested into your stock ledger."
        actions={
          selectedIds.size > 0 ? (
            <AlertDialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="rounded-xl gap-2 border-border/60 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive transition-all duration-300">
                  <Trash2 className="h-4 w-4" />Delete Selected ({selectedIds.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete selected certificates?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes certificates, their unused stock lots, and inward ledger rows.
                    Certificates with any consumed stock will be skipped and protected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl" disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(event) => {
                      event.preventDefault();
                      handleBulkDelete();
                    }}
                    disabled={isBulkDeleting}
                    className="rounded-xl bg-destructive hover:bg-destructive/90"
                  >
                    {isBulkDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Delete Selected
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : undefined
        }
      />
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
                  <th className="text-center w-[40px] pl-4">
                    <Checkbox
                      checked={isAllVisibleSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all certificates"
                    />
                  </th>
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
                      <td className="text-center pl-4" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(t.id)}
                          onCheckedChange={(checked) => handleSelectOne(t.id, !!checked)}
                          aria-label={`Select certificate ${t.tc_number}`}
                        />
                      </td>
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
