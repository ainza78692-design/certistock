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
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export function EntityPage({ table, label, fields }: { table: "customers"|"suppliers"; label: string; fields: { key: string; label: string }[] }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: [table, profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      if (isLocalBackend) return localApi<any[]>(`/api/${table}`);

      const { data } = await supabase.from(table).select("*").eq("company_id", profile!.company_id!).order("created_at", { ascending: false });
      return data || [];
    },
  });

  const create = async () => {
    const nameField = table === "customers" ? "customer_name" : "supplier_name";
    if (!form[nameField]) return toast.error("Name required");
    if (isLocalBackend) {
      try {
        await localApi(`/api/${table}`, {
          method: "POST",
          body: JSON.stringify(form),
        });
        toast.success("Created");
        qc.invalidateQueries({ queryKey: [table] });
        setOpen(false);
        setForm({});
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create");
      }
      return;
    }

    const { error } = await supabase.from(table).insert({ company_id: profile!.company_id!, ...form } as any);
    if (error) toast.error(error.message);
    else { toast.success("Created"); qc.invalidateQueries({ queryKey: [table] }); setOpen(false); setForm({}); }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title={label} subtitle={`Manage your ${label.toLowerCase()}.`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gap-2 shadow-sm hover:shadow-md transition-all duration-300">
                <Plus className="h-4 w-4" />Add {label.slice(0,-1).toLowerCase()}
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader><DialogTitle>New {label.slice(0,-1).toLowerCase()}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                {fields.map(f => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">{f.label}</Label>
                    <Input
                      value={form[f.key] || ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="rounded-xl h-10 bg-background border-border focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/15 transition-all duration-300"
                    />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={create} className="rounded-xl shadow-sm">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="surface overflow-hidden animate-fadeInUp">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[700px]">
            <thead>
              <tr>
                {fields.map(f => <th key={f.key} className="text-left">{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data?.length ? data.map((r: any) => (
                <tr key={r.id}>
                  {fields.map(f => (
                    <td key={f.key} className="whitespace-nowrap">
                      <span className="block truncate max-w-[220px]" title={r[f.key] || "—"}>{r[f.key] || "—"}</span>
                    </td>
                  ))}
                </tr>
              )) : <tr><td colSpan={fields.length} className="text-center py-16 text-muted-foreground text-sm">No {label.toLowerCase()} yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const Customers = () => <EntityPage table="customers" label="Customers" fields={[
  { key: "customer_name", label: "Name" },
  { key: "te_id", label: "TE-ID" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "contact_email", label: "Email" },
  { key: "contact_phone", label: "Phone" },
]} />;

export const Suppliers = () => <EntityPage table="suppliers" label="Suppliers" fields={[
  { key: "supplier_name", label: "Name" },
  { key: "te_id", label: "TE-ID" },
  { key: "license_no", label: "License" },
  { key: "country", label: "Country" },
  { key: "contact_email", label: "Email" },
  { key: "contact_phone", label: "Phone" },
]} />;
