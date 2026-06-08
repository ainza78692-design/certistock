import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtKg } from "@/lib/format";

export default function Products() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const cid = profile?.company_id;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [family, setFamily] = useState("");

  const { data } = useQuery({
    queryKey: ["products", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) {
        const [pm, lots] = await Promise.all([
          localApi<any[]>("/api/product-master"),
          localApi<any[]>("/api/product-stock-summary"),
        ]);
        const totals: Record<string, number> = {};
        lots.forEach((l: any) => {
          const k = l.normalized_yarn_key;
          if (k) totals[k] = Number(l.remaining_stock_kg || 0);
        });
        return pm.map((p: any) => ({ ...p, total_remaining: totals[p.normalized_key] || 0 }));
      }

      const { data: pm } = await supabase.from("product_master").select("*, product_aliases(id, alias_text)").eq("company_id", cid!).order("normalized_key");
      const { data: lots } = await supabase.from("product_lots").select("normalized_yarn_key, remaining_stock_kg").eq("company_id", cid!);
      const totals: Record<string, number> = {};
      lots?.forEach((l: any) => {
        const k = l.normalized_yarn_key;
        if (k) totals[k] = (totals[k] || 0) + Number(l.remaining_stock_kg || 0);
      });
      return (pm || []).map((p: any) => ({ ...p, total_remaining: totals[p.normalized_key] || 0 }));
    },
  });

  const create = async () => {
    if (!key || !name) return toast.error("Key and name required");
    if (isLocalBackend) {
      try {
        await localApi("/api/product-master", {
          method: "POST",
          body: JSON.stringify({ normalized_key: key, display_name: name, product_family: family || null }),
        });
        toast.success("Product added");
        qc.invalidateQueries({ queryKey: ["products"] });
        setOpen(false);
        setKey("");
        setName("");
        setFamily("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add product");
      }
      return;
    }

    const { error } = await supabase.from("product_master").insert({ company_id: cid!, normalized_key: key, display_name: name, product_family: family || null });
    if (error) toast.error(error.message);
    else { toast.success("Product added"); qc.invalidateQueries({ queryKey: ["products"] }); setOpen(false); setKey(""); setName(""); setFamily(""); }
  };

  const addAlias = async (pmId: string) => {
    const text = prompt("Alias text");
    if (!text) return;
    if (isLocalBackend) {
      await localApi("/api/product-aliases", {
        method: "POST",
        body: JSON.stringify({ product_master_id: pmId, alias_text: text }),
      });
      qc.invalidateQueries({ queryKey: ["products"] });
      return;
    }
    await supabase.from("product_aliases").insert({ company_id: cid!, product_master_id: pmId, alias_text: text });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const removeAlias = async (id: string) => {
    if (isLocalBackend) {
      await localApi(`/api/product-aliases/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["products"] });
      return;
    }
    await supabase.from("product_aliases").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Product master" subtitle="Normalized product keys and the raw aliases that map to them."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gap-2 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300">
                <Plus className="h-4 w-4" />Add product
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl">
              <DialogHeader><DialogTitle>New product</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Normalized key</Label>
                  <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. 50D"
                    className="rounded-xl bg-muted/30 border-border/50 focus-visible:border-primary/40 focus-visible:ring-primary/20 transition-all duration-300" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Display name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)}
                    className="rounded-xl bg-muted/30 border-border/50 focus-visible:border-primary/40 focus-visible:ring-primary/20 transition-all duration-300" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Family</Label>
                  <Input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="DTY, FDY, DRWY…"
                    className="rounded-xl bg-muted/30 border-border/50 focus-visible:border-primary/40 focus-visible:ring-primary/20 transition-all duration-300" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={create} className="rounded-xl shadow-md shadow-primary/20">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data?.map((p: any, i: number) => (
          <div key={p.id} className="surface p-5 animate-fadeInUp group" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-lg font-bold tracking-tight">{p.normalized_key}</div>
                <div className="text-xs text-muted-foreground">{p.display_name} · {p.product_family || "—"}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-medium text-muted-foreground tracking-wide">Remaining</div>
                <div className="text-sm font-bold text-primary">{fmtKg(p.total_remaining, 2)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.product_aliases?.map((a: any) => (
                <Badge key={a.id} variant="secondary" className="font-mono text-[10px] gap-1 bg-primary/8 text-primary/80 border-0 hover:bg-primary/12 transition-colors">
                  {a.alias_text}
                  <button onClick={() => removeAlias(a.id)} className="hover:text-destructive transition-colors">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              <button onClick={() => addAlias(p.id)} className="text-xs text-primary/70 hover:text-primary transition-colors font-medium">+ alias</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
