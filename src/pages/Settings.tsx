import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import LocalServerUrlControl from "@/components/LocalServerUrlControl";

export default function Settings() {
  const { profile, user } = useAuth();

  const rows = [
    { label: "Name", value: profile?.full_name || "—" },
    { label: "Email", value: user?.email || "—" },
    { label: "Company ID", value: profile?.company_id?.slice(0, 8) || "—", mono: true },
  ];

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
      <LocalServerUrlControl variant="full" className="mt-4" />
    </div>
  );
}
