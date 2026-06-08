import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { fmtKg, fmtDate } from "@/lib/format";
import { buildBulkLotLabel } from "@/lib/bulkConsumptionMatching";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle,
  SkipForward, Loader2, ArrowLeft, RotateCcw, ChevronRight, Ban, Sparkles,
} from "lucide-react";
import { useBulkConsumption, MatchStatus } from "@/hooks/useBulkConsumption";

const STATUS_CFG: Record<MatchStatus, { icon: any; color: string; label: string }> = {
  matched:   { icon: CheckCircle2,  color: "text-emerald-500", label: "Matched" },
  partial:   { icon: AlertTriangle, color: "text-amber-500",   label: "Low stock" },
  ambiguous: { icon: AlertTriangle, color: "text-amber-500",   label: "Ambiguous" },
  unmatched: { icon: XCircle,       color: "text-red-400",     label: "No lot" },
  duplicate: { icon: Ban,           color: "text-muted-foreground", label: "Duplicate" },
  skipped:   { icon: SkipForward,   color: "text-muted-foreground", label: "Skipped" },
  done:      { icon: CheckCircle2,  color: "text-emerald-500", label: "Done" },
  error:     { icon: XCircle,       color: "text-red-500",     label: "Error" },
};

export default function BulkUploadConsumption() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    step, parsed, lines, lots, stats, processing, processedCount, processableCount,
    handleFile, toggleSkip, updateLot, updateWeight, processAll, reset,
  } = useBulkConsumption();

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try { await handleFile(file); }
    catch (e: any) { toast.error(e.message || "Failed to parse file"); }
  }, [handleFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    onFile(e.dataTransfer.files?.[0]);
  }, [onFile]);

  /* ── Upload Step ── */
  if (step === "upload") {
    return (
      <div className="max-w-3xl mx-auto">
        <PageHeader title="Bulk upload consumption" subtitle="Upload your saledump Excel file to process multiple consumption entries at once."
          actions={<Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate("/consumption")}><ArrowLeft className="h-4 w-4" />Back</Button>} />
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="surface cursor-pointer group border-2 border-dashed border-border/60 hover:border-primary/40 rounded-2xl p-16 text-center transition-all duration-300 hover:bg-primary/[0.02]"
        >
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <FileSpreadsheet className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Drop your saledump file here</h3>
          <p className="text-sm text-muted-foreground mb-4">Supports .xls and .xlsx files from your billing system</p>
          <Badge variant="secondary" className="text-xs">Click to browse</Badge>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        </div>
        <div className="mt-6 surface p-5 rounded-2xl">
          <h4 className="text-sm font-semibold mb-3">Supported formats</h4>
          <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="p-3 rounded-xl bg-muted/40"><span className="font-medium text-foreground block mb-1">Format A — Dual TC</span>IDFL + Non-IDFL per row with separate C.wt columns</div>
            <div className="p-3 rounded-xl bg-muted/40"><span className="font-medium text-foreground block mb-1">Format B — Single TC</span>One TC per row with C.wt and Loss columns</div>
            <div className="p-3 rounded-xl bg-muted/40"><span className="font-medium text-foreground block mb-1">Format C — Basic</span>Standard saledump without TC info (FIFO matching)</div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Review / Processing / Done Steps ── */
  const isDone = step === "done";
  const isProc = step === "processing";
  const matchedLines = lines.filter(l => l.status === "matched" && l.lotId);
  const progress = processableCount > 0 ? (processedCount / processableCount) * 100 : 0;

  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHeader
        title={isDone ? "Bulk upload complete" : isProc ? "Processing…" : `Review ${parsed?.fileName || "upload"}`}
        subtitle={isDone
          ? `${stats.done} succeeded · ${stats.error} failed · ${stats.skipped + stats.duplicate + stats.unmatched + stats.ambiguous} skipped`
          : isProc
          ? `Processing ${processedCount} of ${processableCount}…`
          : `${parsed?.format === "A" ? "Dual TC" : parsed?.format === "B" ? "Single TC" : "Basic"} format · ${lines.length} consumption lines from ${parsed?.rows.length || 0} invoice rows`}
        actions={
          <div className="flex gap-2">
            {isDone && <Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate("/consumption")}><CheckCircle2 className="h-4 w-4" />View consumption</Button>}
            {(isDone || step === "review") && <Button variant="outline" className="rounded-xl gap-2" onClick={reset}><RotateCcw className="h-4 w-4" />New upload</Button>}
            {step === "review" && (
              <Button className="rounded-xl gap-2 shadow-sm" disabled={processableCount === 0} onClick={processAll}>
                <Sparkles className="h-4 w-4" />Process {processableCount} matched rows
              </Button>
            )}
          </div>
        }
      />

      {/* Stats bar */}
      <div className="surface p-3 mb-4 animate-fadeInUp">
        <div className="flex items-center gap-4 text-xs">
          <StatBadge label="Matched" count={stats.matched} color="bg-emerald-500/15 text-emerald-600" />
          <StatBadge label="Low stock" count={stats.partial} color="bg-amber-500/15 text-amber-600" />
          <StatBadge label="Ambiguous" count={stats.ambiguous} color="bg-amber-500/15 text-amber-600" />
          <StatBadge label="No lot" count={stats.unmatched} color="bg-red-500/15 text-red-500" />
          <StatBadge label="Duplicate" count={stats.duplicate} color="bg-muted text-muted-foreground" />
          <StatBadge label="Skipped" count={stats.skipped} color="bg-muted text-muted-foreground" />
          {(isDone) && <StatBadge label="Done" count={stats.done} color="bg-emerald-500/15 text-emerald-600" />}
          {(isDone) && <StatBadge label="Errors" count={stats.error} color="bg-red-500/15 text-red-500" />}
          <div className="ml-auto font-medium text-foreground">{fmtKg(stats.totalWeight, 2)} to process</div>
        </div>
      </div>

      {/* Progress bar during processing */}
      {isProc && (
        <div className="mb-4 animate-fadeInUp">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1.5 text-center">{processedCount} / {processableCount} completed</p>
        </div>
      )}

      {/* Table */}
      <div className="surface overflow-hidden animate-fadeInUp">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1550px]">
            <thead>
              <tr>
                <th className="w-[70px]">Status</th>
                <th className="text-left w-[110px]">Invoice</th>
                <th className="text-left w-[90px]">Date</th>
                <th className="text-left w-[180px]">Buyer</th>
                <th className="text-left w-[100px]">Count</th>
                <th className="text-left w-[140px]">TC Number</th>
                <th className="text-left w-[90px]">Shipment</th>
                <th className="text-left w-[250px]">Lot Assignment</th>
                <th className="text-right w-[100px]">Consumed</th>
                <th className="text-right w-[80px]">Loss %</th>
                <th className="text-right w-[110px]">Outward cert.</th>
                <th className="text-right w-[90px]">Net (kg)</th>
                <th className="text-right w-[90px]">Gross (kg)</th>
                <th className="w-[70px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => {
                const cfg = STATUS_CFG[line.status];
                const Icon = cfg.icon;
                const isSkippable = !["done", "error"].includes(line.status) && !isProc;
                return (
                  <tr key={line.id} className={line.status === "skipped" || line.status === "duplicate" ? "opacity-50" : ""}>
                    <td>
                      <div className="flex items-center gap-1.5" title={line.errorMsg || cfg.label}>
                        {line.status === "done" && processing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />}
                        <span className={`text-[11px] ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">{line.invoiceNo}</td>
                    <td className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(line.invoiceDate)}</td>
                    <td><span className="block truncate max-w-[170px] text-xs" title={line.customerName}>{line.customerName}</span></td>
                    <td className="text-xs font-medium whitespace-nowrap">{line.sourceRow.count || "—"}</td>
                    <td className="font-mono text-xs whitespace-nowrap">{line.tcEntry?.tcNumber || "—"}</td>
                    <td className="font-mono text-xs whitespace-nowrap">{line.tcEntry?.shipmentNo ?? line.tcEntry?.sheetRef ?? "—"}</td>
                    <td>
                      {step === "review" && !["done","error","skipped","duplicate"].includes(line.status) ? (
                        <Select value={line.lotId || ""} onValueChange={v => updateLot(line.id, v)}>
                          <SelectTrigger className="h-7 text-xs rounded-lg border-border/60">
                            <SelectValue placeholder="Select lot…" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {(lots || []).map((l: any) => (
                              <SelectItem key={l.id} value={l.id} className="text-xs">
                                {buildBulkLotLabel(l)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground truncate block max-w-[240px]" title={line.lotLabel}>{line.lotLabel || "—"}</span>
                      )}
                      {line.errorMsg && line.status !== "duplicate" && line.status !== "skipped" && (
                        <span className="text-[10px] text-red-400 block mt-0.5">{line.errorMsg}</span>
                      )}
                    </td>
                    <td className="text-right">
                      {step === "review" && !["done","error","skipped","duplicate"].includes(line.status) ? (
                        <Input type="number" value={line.consumedWeightKg || ""} onChange={e => updateWeight(line.id, Number(e.target.value) || 0)}
                          className="h-7 w-20 text-xs text-right ml-auto rounded-lg" />
                      ) : (
                        <span className="tabular-nums text-xs">{fmtKg(line.consumedWeightKg, 2)}</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums text-xs">
                      {line.lossPercent != null ? `${line.lossPercent.toFixed(2)}%` : "0.00%"}
                    </td>
                    <td className="text-right tabular-nums text-xs">{fmtKg(line.outwardCertifiedWeightKg, 3)}</td>
                    <td className="text-right tabular-nums text-xs">{line.netWeightKg ? fmtKg(line.netWeightKg, 2) : "—"}</td>
                    <td className="text-right tabular-nums text-xs">{line.grossWeightKg ? fmtKg(line.grossWeightKg, 2) : "—"}</td>
                    <td className="text-center">
                      {isSkippable && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title={line.status === "skipped" ? "Unskip" : "Skip"} onClick={() => toggleSkip(line.id)}>
                          <SkipForward className={`h-3.5 w-3.5 ${line.status === "skipped" ? "text-primary" : "text-muted-foreground"}`} />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium ${color}`}>{count} {label}</span>;
}
