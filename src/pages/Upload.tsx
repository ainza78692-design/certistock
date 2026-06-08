import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import PageHeader from "@/components/PageHeader";
import { Upload as UploadIcon, FileText, Loader2, CheckCircle2, X, Sparkles, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ensureCompanyForUser } from "@/lib/ensureCompany";

type ItemStatus = "pending" | "uploading" | "extracting" | "ready" | "error";
type Item = { file: File; status: ItemStatus; id?: string; error?: string };

export default function Upload() {
  const { profile, user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);

  const onFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type === "application/pdf");
    if (!arr.length) return toast.error("Please drop PDF files");
    setItems(prev => [...prev, ...arr.map(file => ({ file, status: "pending" as const }))]);
  };

  const updateItem = (i: number, patch: Partial<Item>) =>
    setItems(prev => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const deleteFile = async (f: any) => {
    if (isLocalBackend) {
      await localApi(`/api/uploads/${f.id}`, { method: "DELETE" });
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["uploaded_files"] });
      return;
    }

    if (f.storage_path) {
      await supabase.storage.from("tc-pdfs").remove([f.storage_path]);
    }
    const { error } = await supabase.from("uploaded_files").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["uploaded_files"] });
  };

  const upload = async () => {
    if (!user) return toast.error("Please sign in again");
    let companyId = profile?.company_id ?? null;
    if (!companyId) {
      try {
        const repaired = await ensureCompanyForUser(user, profile);
        companyId = repaired.company_id;
        await refreshProfile();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not create company";
        return toast.error(message);
      }
    }
    if (!companyId) return toast.error("No company");
    const uploadedIds: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.status !== "pending") continue;
      updateItem(i, { status: "uploading" });
      if (isLocalBackend) {
        try {
          const form = new FormData();
          form.append("file", it.file);
          const data = await localApi<any>("/api/uploads/tc-pdfs", {
            method: "POST",
            body: form,
          });
          updateItem(i, { status: "extracting", id: data.id });
          try {
            await localApi(`/api/uploads/${data.id}/extract`, { method: "POST" });
            updateItem(i, { status: "ready", id: data.id });
          } catch (error) {
            updateItem(i, {
              status: "ready",
              id: data.id,
              error: error instanceof Error ? error.message : "Auto extraction failed - fill manually",
            });
            toast.warning(`${it.file.name}: Auto extraction needs review.`);
          }
          uploadedIds.push(data.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          updateItem(i, { status: "error", error: message });
          toast.error(message);
        }
        continue;
      }

      const path = `${companyId}/${Date.now()}_${it.file.name}`;
      const { error: upErr } = await supabase.storage.from("tc-pdfs").upload(path, it.file);
      if (upErr) { updateItem(i, { status: "error", error: upErr.message }); toast.error(upErr.message); continue; }

      const { data, error } = await supabase.from("uploaded_files").insert({
        company_id: companyId,
        uploaded_by: user.id,
        file_name: it.file.name,
        file_type: it.file.type,
        file_size: it.file.size,
        storage_path: path,
        parsing_status: "pending",
      }).select().single();
      if (error) { updateItem(i, { status: "error", error: error.message }); toast.error(error.message); continue; }

      updateItem(i, { status: "extracting", id: data.id });

      const { error: fnErr } = await supabase.functions.invoke("extract-tc", { body: { fileId: data.id } });
      if (fnErr) {
        updateItem(i, { status: "ready", id: data.id, error: "Auto extraction failed - fill manually" });
        toast.warning(`${it.file.name}: Auto extraction failed, you can review manually.`);
      } else {
        updateItem(i, { status: "ready", id: data.id });
      }
      uploadedIds.push(data.id);
    }

    qc.invalidateQueries({ queryKey: ["uploaded_files"] });

    if (uploadedIds.length === 1) {
      toast.success("Ready to review");
      navigate(`/review/${uploadedIds[0]}`);
    } else if (uploadedIds.length > 1) {
      toast.success(`${uploadedIds.length} files ready to review`);
    }
  };

  const { data: files } = useQuery({
    queryKey: ["uploaded_files", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      if (isLocalBackend) return localApi<any[]>("/api/uploads");

      const { data } = await supabase.from("uploaded_files")
        .select("*").eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
  });

  const pendingReview = (files || []).filter((f: any) => f.parsing_status !== "approved");
  const allDone = items.length > 0 && items.every(i => i.status === "ready" || i.status === "error");

  const steps = [
    { n: 1, label: "Upload PDF", active: true, done: items.some(i => i.status !== "pending") },
    { n: 2, label: "OCR + AI extracts data", active: items.some(i => i.status === "extracting" || i.status === "ready"), done: items.some(i => i.status === "ready") },
    { n: 3, label: "Review and approve", active: allDone, done: false },
    { n: 4, label: "Stock lots created", active: false, done: false },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Upload transaction certificates"
        subtitle="Drop PDFs from IDFL, Control Union or Intertek. We auto-extract data with OCR + AI, then you review and approve."
      />

      {/* Stepper */}
      <div className="surface p-4 mb-5 animate-fadeInUp">
        <div className="flex items-center justify-between gap-2">
          {steps.map((s, idx) => (
            <div key={s.n} className="flex items-center flex-1 last:flex-none gap-3">
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-semibold shrink-0 transition-all duration-300 ${
                s.done
                  ? "bg-success text-success-foreground shadow-md shadow-success/20"
                  : s.active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-muted/50 text-muted-foreground"
              }`}>
                {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
              </div>
              <span className={`text-xs font-medium hidden sm:block transition-colors duration-200 ${s.active || s.done ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
              {idx < steps.length - 1 && <div className={`flex-1 h-px hidden sm:block transition-colors duration-300 ${s.done ? "bg-success/40" : "bg-border/50"}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
        className={`surface border-2 border-dashed transition-all duration-300 p-12 flex flex-col items-center text-center animate-fadeInUp ${
          drag
            ? "border-primary bg-primary/[0.04] shadow-lg shadow-primary/10"
            : "border-border/50 hover:border-primary/25"
        }`}
        style={{ animationDelay: "60ms" }}
      >
        <div className={`h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 transition-all duration-300 ${drag ? "scale-110 bg-primary/15" : ""}`}>
          <UploadIcon className="h-6 w-6" />
        </div>
        <h3 className="font-semibold text-base">Drag and drop PDFs here</h3>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> OCR + AI will extract TC number, supplier, products and weights
        </p>
        <label className="mt-5">
          <input type="file" accept="application/pdf" multiple className="hidden"
            onChange={(e) => e.target.files && onFiles(e.target.files)} />
          <Button asChild variant="outline" size="sm" className="rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/[0.03] transition-all duration-300">
            <span>Choose files</span>
          </Button>
        </label>
      </div>

      {/* File list */}
      {items.length > 0 && (
        <div className="surface mt-4 p-4 animate-fadeInUp" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">{items.length} file{items.length === 1 ? "" : "s"} selected</h4>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setItems([])} className="text-muted-foreground hover:text-foreground">Clear</Button>
              <Button size="sm" onClick={upload} disabled={items.every(i => i.status !== "pending")} className="rounded-xl shadow-md shadow-primary/20">
                Upload and extract
              </Button>
            </div>
          </div>
          <div className="divide-y divide-border/50">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{it.file.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {(it.file.size / 1024).toFixed(0)} KB
                    {it.status === "uploading" && <span className="text-primary">· Uploading…</span>}
                    {it.status === "extracting" && <span className="flex items-center gap-1 text-primary"><Sparkles className="h-3 w-3" /> OCR + AI extracting...</span>}
                    {it.status === "ready" && <span className="text-success">· Ready to review</span>}
                    {it.status === "error" && <span className="text-destructive">· {it.error}</span>}
                  </div>
                </div>
                {(it.status === "uploading" || it.status === "extracting") && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {it.status === "ready" && <CheckCircle2 className="h-4 w-4 text-success" />}
                {it.status === "error" && <X className="h-4 w-4 text-destructive" />}
                {it.status === "ready" && it.id && (
                  <Button size="sm" onClick={() => navigate(`/review/${it.id}`)} className="gap-1 rounded-xl">
                    Review <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
                {(it.status === "pending" || it.status === "error") && (
                  <Button variant="ghost" size="icon" onClick={() => removeItem(i)} aria-label="Remove" className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending review banner */}
      {pendingReview.length > 0 && items.length === 0 && (
        <div className="surface mt-4 p-4 border-warning/20 bg-warning/[0.04] animate-fadeInUp" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">{pendingReview.length} file{pendingReview.length === 1 ? "" : "s"} waiting for review</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Approve them to create stock lots.</p>
            </div>
            <Button size="sm" onClick={() => navigate(`/review/${pendingReview[0].id}`)} className="gap-1 rounded-xl">
              Review next <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Recent uploads */}
      <div className="surface mt-6 p-5 animate-fadeInUp" style={{ animationDelay: "180ms" }}>
        <h3 className="text-sm font-semibold mb-3">Recent uploads</h3>
        {files?.length ? (
          <div className="divide-y divide-border/50">
            {files.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 py-3 hover:bg-primary/[0.02] -mx-2 px-2 rounded-lg transition-colors duration-200">
                <button onClick={() => navigate(`/review/${f.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{f.file_name}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(f.created_at)}</div>
                  </div>
                  <Badge variant="secondary" className="capitalize bg-muted/50 border-0 font-medium">{f.parsing_status?.replace("_", " ")}</Badge>
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Delete file" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this PDF?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{f.file_name}" will be permanently removed. If it was already approved into stock lots, those lots remain.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteFile(f)} className="rounded-xl bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No uploads yet.</p>
        )}
      </div>
    </div>
  );
}
