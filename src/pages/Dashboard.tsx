import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Package, FileText, ShoppingCart, AlertTriangle, ArrowRight, Boxes, TrendingUp, TrendingDown, CalendarIcon, PackagePlus } from "lucide-react";
import { fmtKg } from "@/lib/format";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import type { DateRange } from "react-day-picker";

/* ─── Time range presets ─── */
type RangeKey = "7d" | "30d" | "90d" | "12m" | "all" | "custom";

const PRESETS: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "7d",  label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

const getPresetDate = (key: Exclude<RangeKey, "custom">): Date | null => {
  const now = new Date();
  switch (key) {
    case "7d":  return new Date(now.getTime() - 7 * 86400000);
    case "30d": return new Date(now.getTime() - 30 * 86400000);
    case "90d": return new Date(now.getTime() - 90 * 86400000);
    case "12m": return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case "all": return null;
  }
};

const shortDate = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/* ─── Sub-components ─── */
const toneStyles: Record<string, { icon: string }> = {
  default: { icon: "bg-primary/10 text-primary" },
  success: { icon: "bg-success/10 text-success" },
  warning: { icon: "bg-warning/10 text-warning" },
};

const Stat = ({ icon: Icon, label, value, change, tone = "default", delay = 0 }: any) => {
  const t = toneStyles[tone] || toneStyles.default;
  return (
    <div className="stat-card animate-fadeInUp" style={{ animationDelay: `${delay}ms` }}>
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground tracking-wide">{label}</span>
          <div className={`h-9 w-9 rounded-xl ${t.icon} flex items-center justify-center transition-transform duration-300 hover:scale-110`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
        {change !== undefined && change !== null && (
          <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${change >= 0 ? "text-success" : "text-destructive"}`}>
            {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</span>
            <span className="text-muted-foreground font-normal">vs prior</span>
          </div>
        )}
      </div>
    </div>
  );
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2" style={{ boxShadow: "var(--shadow-md)" }}>
      <p className="text-xs font-medium text-foreground mb-0.5">{label}</p>
      <p className="text-sm font-bold text-primary">{fmtKg(payload[0].value, 2)}</p>
    </div>
  );
};

/* ─── Date Range Picker ─── */
function DateRangePicker({
  range,
  activePreset,
  onPreset,
  onCustomRange,
}: {
  range: { from: Date | null; to: Date | null };
  activePreset: RangeKey;
  onPreset: (key: Exclude<RangeKey, "custom">) => void;
  onCustomRange: (from: Date, to: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [calRange, setCalRange] = useState<DateRange | undefined>(
    range.from && range.to ? { from: range.from, to: range.to } : undefined
  );

  const handleCalSelect = (r: DateRange | undefined) => {
    setCalRange(r);
    if (r?.from && r?.to) {
      onCustomRange(r.from, r.to);
      setOpen(false);
    }
  };

  const displayLabel = activePreset === "custom" && range.from && range.to
    ? `${shortDate(range.from)} – ${shortDate(range.to)}`
    : null;

  return (
    <div className="flex items-center gap-2">
      {/* Preset pills */}
      <div className="flex items-center bg-muted/50 rounded-xl p-1 gap-0.5">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
              activePreset === p.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Calendar picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`rounded-xl gap-2 h-[34px] text-xs font-medium border-border/60 transition-all duration-200 ${
              activePreset === "custom"
                ? "border-primary/30 bg-primary/[0.04] text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {displayLabel || "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 rounded-2xl border-border/60"
          align="end"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          <div className="p-3 border-b border-border/40">
            <p className="text-sm font-semibold">Select date range</p>
            <p className="text-xs text-muted-foreground mt-0.5">Click the start and end dates</p>
          </div>
          <Calendar
            mode="range"
            selected={calRange}
            onSelect={handleCalSelect}
            numberOfMonths={2}
            disabled={{ after: new Date() }}
            className="rounded-b-2xl"
          />
          {calRange?.from && !calRange?.to && (
            <div className="px-3 pb-3">
              <p className="text-xs text-muted-foreground">
                Start: <span className="font-medium text-foreground">{shortDate(calRange.from)}</span> — now pick the end date
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ─── Main Dashboard ─── */
export default function Dashboard() {
  const { profile } = useAuth();
  const cid = profile?.company_id;

  const [activePreset, setActivePreset] = useState<RangeKey>("all");
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);

  // Resolved cutoff dates
  const cutoffFrom = useMemo(() => {
    if (activePreset === "custom") return customFrom;
    if (activePreset === "all") return null;
    return getPresetDate(activePreset);
  }, [activePreset, customFrom]);

  const cutoffTo = useMemo(() => {
    if (activePreset === "custom") return customTo;
    return new Date(); // always "now" for presets
  }, [activePreset, customTo]);

  const handlePreset = (key: Exclude<RangeKey, "custom">) => {
    setActivePreset(key);
    setCustomFrom(null);
    setCustomTo(null);
  };

  const handleCustomRange = (from: Date, to: Date) => {
    setActivePreset("custom");
    setCustomFrom(from);
    setCustomTo(to);
  };

  // Fetch all data once, filter client-side for instant switching
  const { data: rawData, isLoading } = useQuery({
    queryKey: ["dashboard-raw", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) {
        return localApi<{ lots: any[]; incomingStock: any[]; pending: number; consumption: any[] }>("/api/dashboard");
      }

      const [lots, incomingStock, files, consumption] = await Promise.all([
        supabase.from("product_lots")
          .select("certified_weight_kg, remaining_stock_kg, consumed_stock_kg, status, normalized_yarn_key, created_at")
          .eq("company_id", cid!),
        (supabase as any).from("incoming_stock")
          .select("invoice_no, yarn_count, normalized_yarn_key, net_weight_kg, shipment_date, created_at")
          .eq("company_id", cid!)
          .is("matched_tc_id", null),
        supabase.from("uploaded_files")
          .select("id, parsing_status")
          .eq("company_id", cid!)
          .in("parsing_status", ["needs_review", "pending", "processing"]),
        supabase.from("consumption_entries")
          .select("consumed_weight_kg, consumption_date")
          .eq("company_id", cid!)
          .order("consumption_date", { ascending: true }),
      ]);
      return {
        lots: lots.data || [],
        incomingStock: incomingStock.data || [],
        pending: files.data?.length || 0,
        consumption: consumption.data || [],
      };
    },
  });

  // Compute stats from filtered data
  const stats = useMemo(() => {
    if (!rawData) return null;

    const lotsArr = cutoffFrom
      ? rawData.lots.filter((l: any) => {
          const d = new Date(l.created_at);
          return d >= cutoffFrom! && (!cutoffTo || d <= cutoffTo);
        })
      : rawData.lots;

    // Prior period for % change (only for presets)
    let priorLots: any[] = [];
    if (cutoffFrom && activePreset !== "custom") {
      const periodMs = (cutoffTo?.getTime() || Date.now()) - cutoffFrom.getTime();
      const priorCutoff = new Date(cutoffFrom.getTime() - periodMs);
      priorLots = rawData.lots.filter((l: any) => {
        const d = new Date(l.created_at);
        return d >= priorCutoff && d < cutoffFrom!;
      });
    }

    const sum = (arr: any[]) => arr.reduce((acc, l) => ({
      certified: acc.certified + Number(l.certified_weight_kg || 0),
      remaining: acc.remaining + Number(l.remaining_stock_kg || 0),
      consumed: acc.consumed + Number(l.consumed_stock_kg || 0),
    }), { certified: 0, remaining: 0, consumed: 0 });

    const totals = sum(lotsArr);
    const priorTotals = sum(priorLots);
    const incomingArr = cutoffFrom
      ? (rawData.incomingStock || []).filter((row: any) => {
          const d = new Date(row.shipment_date || row.created_at);
          return d >= cutoffFrom! && (!cutoffTo || d <= cutoffTo);
        })
      : (rawData.incomingStock || []);
    const incoming = incomingArr.reduce((acc: number, row: any) => acc + Number(row.net_weight_kg || 0), 0);

    const pctChange = (cur: number, prev: number) => {
      if (activePreset === "all" || activePreset === "custom" || prev === 0) return null;
      return ((cur - prev) / prev) * 100;
    };

    // Stock by product for bar chart
    const byKey: Record<string, number> = {};
    lotsArr.forEach((l: any) => {
      const k = l.normalized_yarn_key || "Unmapped";
      byKey[k] = (byKey[k] || 0) + Number(l.remaining_stock_kg || 0);
    });

    // Consumption trend for area chart
    const consumptionFiltered = cutoffFrom
      ? rawData.consumption.filter((c: any) => {
          const d = new Date(c.consumption_date);
          return d >= cutoffFrom! && (!cutoffTo || d <= cutoffTo);
        })
      : rawData.consumption;

    const byDate: Record<string, number> = {};
    consumptionFiltered.forEach((c: any) => {
      const d = c.consumption_date?.slice(0, 10);
      if (d) byDate[d] = (byDate[d] || 0) + Number(c.consumed_weight_kg || 0);
    });
    const consumptionChart = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kg]) => ({
        date: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        kg: Number(kg.toFixed(2)),
      }));

    return {
      ...totals,
      incoming,
      future: totals.remaining + incoming,
      certifiedChange: pctChange(totals.certified, priorTotals.certified),
      consumedChange: pctChange(totals.consumed, priorTotals.consumed),
      active: lotsArr.filter((l: any) => l.status === "active").length,
      exhausted: lotsArr.filter((l: any) => l.status === "exhausted").length,
      lowStock: lotsArr.filter((l: any) => Number(l.remaining_stock_kg) > 0 && Number(l.remaining_stock_kg) < 100).length,
      pending: rawData.pending,
      stockChart: Object.entries(byKey).map(([key, kg]) => ({ key, kg: Number(kg.toFixed(2)) })),
      consumptionChart,
      totalLots: lotsArr.length,
    };
  }, [rawData, cutoffFrom, cutoffTo, activePreset]);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title={`Welcome back${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`}
        subtitle="Here's a snapshot of your certified stock and outstanding work."
        actions={
          <DateRangePicker
            range={{ from: cutoffFrom, to: cutoffTo }}
            activePreset={activePreset}
            onPreset={handlePreset}
            onCustomRange={handleCustomRange}
          />
        }
      />

      {/* ─── Stats ─── */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={Package} label="Certified stock" value={fmtKg(stats?.remaining, 2)} delay={0} />
          <Stat icon={PackagePlus} label="Incoming stock" value={fmtKg(stats?.incoming, 2)} tone="warning" delay={60} />
          <Stat icon={Boxes} label="Total future stock" value={fmtKg(stats?.future, 2)} tone="success" delay={120} />
          <Stat icon={ShoppingCart} label="Consumed" value={fmtKg(stats?.consumed, 2)} change={stats?.consumedChange} delay={180} />
        </div>
      )}

      {/* ─── Charts row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {/* Stock by product */}
        <div className="surface p-5 animate-fadeInUp" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Remaining stock by product</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{stats?.totalLots ?? 0} lots · {stats?.stockChart?.length ?? 0} products</p>
            </div>
            <Link to="/lots" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors group">
              View lots <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          <div className="h-64">
            {stats?.stockChart?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.stockChart}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} strokeOpacity={0.6} />
                  <XAxis dataKey="key" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--primary) / 0.04)" }} />
                  <Bar dataKey="kg" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No stock data for this period.
              </div>
            )}
          </div>
        </div>

        {/* Consumption trend */}
        <div className="surface p-5 animate-fadeInUp" style={{ animationDelay: "300ms" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Consumption trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{stats?.consumptionChart?.length ?? 0} data points</p>
            </div>
            <Link to="/consumption" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors group">
              View all <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          <div className="h-64">
            {stats?.consumptionChart?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.consumptionChart}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} strokeOpacity={0.6} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="kg" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#areaGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No consumption data for this period.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Quick actions ─── */}
      <div className="surface p-5 mt-4 animate-fadeInUp" style={{ animationDelay: "360ms" }}>
        <h3 className="text-sm font-semibold mb-3">Quick actions</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { to: "/upload", icon: FileText, label: "Upload TC" },
            { to: "/live-stock", icon: PackagePlus, label: "Live stock" },
            { to: "/lots", icon: Package, label: "Browse stock" },
            { to: "/consumption/new", icon: ShoppingCart, label: "Record consumption" },
          ].map((a) => (
            <Link key={a.to} to={a.to}
              className="flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:border-primary/20 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.04] transition-all duration-300 group"
            >
              <div className="h-9 w-9 rounded-xl bg-primary/8 text-primary flex items-center justify-center group-hover:bg-primary/12 transition-colors duration-300 shrink-0">
                <a.icon className="h-4 w-4" />
              </div>
              <span className="text-sm">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ─── Low stock alert ─── */}
      {(stats?.lowStock || 0) > 0 && (
        <div className="mt-4 surface p-4 border-warning/20 animate-fadeInUp" style={{ animationDelay: "420ms" }}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-warning/10 text-warning flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex-1 text-sm">
              <span className="font-semibold">{stats?.lowStock}</span> lot{stats?.lowStock === 1 ? "" : "s"} below 100 kg remaining.
            </div>
            <Link to="/lots" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap">Review →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
