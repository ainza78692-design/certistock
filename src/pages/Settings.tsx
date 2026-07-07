import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import LocalServerUrlControl from "@/components/LocalServerUrlControl";
import { isLocalBackend } from "@/lib/backendMode";
import { localAccounts, localSwitchAccount } from "@/lib/localApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const accountIdForEmail = (email?: string | null) => {
  if (!email) return "yes_fashion";
  return email.toLowerCase() === "tester@certistock.local" ? "tester" : "yes_fashion";
};

export default function Settings() {
  const { profile, user, refreshProfile } = useAuth();
  const [switching, setSwitching] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentAccountId = accountIdForEmail(user?.email);

  const { data: accountData } = useQuery({
    queryKey: ["local-accounts"],
    enabled: isLocalBackend,
    queryFn: localAccounts,
  });

  const rows = [
    { label: "Name", value: profile?.full_name || "-" },
    { label: "Email", value: user?.email || "-" },
    { label: "Company ID", value: profile?.company_id?.slice(0, 8) || "-", mono: true },
  ];

  const switchAccount = async (account: "yes_fashion" | "tester") => {
    if (account === currentAccountId || switching) return;
    setSwitching(true);
    try {
      await localSwitchAccount(account);
      queryClient.clear();
      await refreshProfile();
      toast.success(`Switched to ${account === "tester" ? "tester" : "yes_fashion"}`);
      navigate("/", { replace: true });
      setSwitching(false);
    } catch (error: any) {
      toast.error(error?.message || "Could not switch account");
      setSwitching(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Settings" subtitle="Account and company preferences." />
      <div className="surface p-6 animate-fadeInUp">
        <div className="space-y-0">
          {rows.map((row, i) => (
            <div
              key={row.label}
              className={`flex justify-between items-center py-3.5 ${i < rows.length - 1 ? "border-b border-border/40" : ""}`}
            >
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className={`text-sm font-medium ${row.mono ? "font-mono text-xs text-muted-foreground" : ""}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {isLocalBackend && (
        <div className="surface p-6 mt-4 animate-fadeInUp">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Active account</div>
              <div className="text-xs text-muted-foreground mt-1">Switch between real Yes Fashion data and isolated tester data.</div>
            </div>
            <Select value={currentAccountId} onValueChange={(value) => switchAccount(value as "yes_fashion" | "tester")} disabled={switching}>
              <SelectTrigger className="w-[220px] rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(accountData?.accounts || [
                  { id: "yes_fashion", label: "yes_fashion", email: "yesfashion@gmail.com" },
                  { id: "tester", label: "tester", email: "tester@certistock.local" },
                ]).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <LocalServerUrlControl variant="full" className="mt-4" />
    </div>
  );
}