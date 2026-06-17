import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Package, FileText, ShoppingCart, AlertTriangle, ArrowRight, Boxes, TrendingUp, TrendingDown, PackagePlus, Warehouse } from "lucide-react";
import { fmtKg } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildMonthlyAnalytics, getAvailableYears } from "@/lib/monthAnalytics";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
            <span className="text-muted-foreground font-normal">vs prior month</span>
          </div>
        )}
      </div>
    </div>
  );
};

const FlowStat = ({ icon: Icon, label, value, subtext, focus = false, tone = "default", delay = 0 }: any) => {
  const t = toneStyles[tone] || toneStyles.default;
  return (
    <div
      className={`stat-card animate-fadeInUp ${focus ? "border-primary/35 bg-primary/[0.04] shadow-sm" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-medium text-muted-foreground tracking-wide">{label}</span>
          <div className={`mt-3 font-bold tracking-tight ${focus ? "text-3xl text-primary" : "text-2xl"}`}>{value}</div>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{subtext}</p>
        </div>
        <div className={`h-9 w-9 rounded-xl ${focus ? "bg-primary text-primary-foreground" : t.icon} flex items-center justify-center shrink-0`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2" style={{ boxShadow: "var(--shadow-md)" }}>
      <p className="text-xs font-medium text-foreground mb-0.5">{label}</p>
      {payload.map((item: any) => (
        <p key={item.dataKey} className="text-sm font-bold" style={{ color: item.color || "hsl(var(--primary))" }}>
          {item.name || item.dataKey}: {fmtKg(item.value, 2)}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { profile } = useAuth();
  const cid = profile?.company_id;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Filter state: year + month (0 = "All year")
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth); // 0 = all

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["dashboard-raw", cid],
    enabled: !!cid,
    queryFn: async () => {
      if (isLocalBackend) {
        return localApi<{ lots: any[]; incomingStock: any[]; pending: number; consumption: any[] }>("/api/dashboard");
      }

      const [lots, incomingStock, files, consumption] = await Promise.all([
        supabase.from("product_lots")
          .select("certified_weight_kg, remaining_stock_kg, consumed_stock_kg, opening_stock_kg, status, normalized_yarn_key, created_at, shipments(shipment_date)")
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

  const normalizedLots = useMemo(() => (
    (rawData?.lots || []).map((lot: any) => ({
      ...lot,
      shipment_date: lot.shipment_date || lot.shipments?.shipment_date || null,
    }))
  ), [rawData]);

  // Derive available years from actual data
  const availableYears = useMemo(() => {
    const years = getAvailableYears({
      shipmentLots: normalizedLots,
      consumptions: rawData?.consumption || [],
    });
    // Always include the current year
    if (!years.includes(currentYear)) years.push(currentYear);
    return years.sort((a, b) => b - a); // descending
  }, [normalizedLots, rawData, currentYear]);

  const monthlyAnalytics = useMemo(
    () => buildMonthlyAnalytics({ shipmentLots: normalizedLots, consumptions: rawData?.consumption || [] }, selectedYear),
    [normalizedLots, rawData, selectedYear],
  );

  const stats = useMemo(() => {
    if (!rawData) return null;

    // KPI values derived from monthlyAnalytics (filtered by selectedYear)
    const yearTotalReceived = monthlyAnalytics.reduce((sum, p) => sum + p.receivedKg, 0);
    const yearTotalConsumed = monthlyAnalytics.reduce((sum, p) => sum + p.consumedKg, 0);

    // Incoming stock pipeline filtered by selected year
    const inboundPipelineKg = (rawData.incomingStock || [])
      .filter((item: any) => {
        const itemYear = item.shipment_date ? Number(item.shipment_date.slice(0, 4)) : null;
        return itemYear === selectedYear;
      })
      .reduce((sum: number, item: any) => sum + Number(item.net_weight_kg || 0), 0);

    // Closing balance: use selected month or last month of year that has data
    const effectiveMonth = selectedMonth > 0 ? selectedMonth : 12;
    const selectedPoint = monthlyAnalytics.find((p) => p.month === effectiveMonth) || monthlyAnalytics[11];
    const previousPoint = monthlyAnalytics.find((p) => p.month === Math.max(effectiveMonth - 1, 1));
    const pctChange = (current: number, previous: number) => {
      if (!previous) return null;
      return ((current - previous) / previous) * 100;
    };

    // If "All year" is selected, KPIs show year totals
    // If specific month, KPIs show that month's data
    const displayReceived = selectedMonth === 0 ? yearTotalReceived : selectedPoint.receivedKg;
    const displayConsumed = selectedMonth === 0 ? yearTotalConsumed : selectedPoint.consumedKg;
    const displayClosing = selectedPoint.closingKg;

    return {
      selectedPoint,
      openingChange: previousPoint ? pctChange(selectedPoint.openingKg, previousPoint.openingKg) : null,
      receivedChange: previousPoint ? pctChange(selectedPoint.receivedKg, previousPoint.receivedKg) : null,
      consumedChange: previousPoint ? pctChange(selectedPoint.consumedKg, previousPoint.consumedKg) : null,
      closingChange: previousPoint ? pctChange(selectedPoint.closingKg, previousPoint.closingKg) : null,
      active: normalizedLots.filter((lot: any) => lot.status === "active").length,
      lowStock: normalizedLots.filter((lot: any) => Number(lot.remaining_stock_kg) > 0 && Number(lot.remaining_stock_kg) < 100).length,
      pending: rawData.pending,
      inboundPipelineKg,
      displayReceived,
      displayConsumed,
      displayClosing,
      monthlyChart: monthlyAnalytics.map((point) => ({
        month: point.label,
        receivedKg: Number(point.receivedKg.toFixed(2)),
        consumedKg: Number(point.consumedKg.toFixed(2)),
        closingKg: Number(point.closingKg.toFixed(2)),
      })),
    };
  }, [rawData, monthlyAnalytics, normalizedLots, selectedMonth, selectedYear]);

  // Check if chart has any non-zero data
  const hasMovementData = stats?.monthlyChart?.some((p) => p.receivedKg > 0 || p.consumedKg > 0) ?? false;
  const hasClosingData = stats?.monthlyChart?.some((p) => p.closingKg > 0) ?? false;

  // Period label for display
  const periodLabel = selectedMonth === 0
    ? `${selectedYear} full year`
    : `${MONTH_LABELS[selectedMonth - 1]} ${selectedYear}`;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title={`Welcome back${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        subtitle={`Certified stock movement driven by shipment dates — ${periodLabel}`}
        actions={
          <div className="flex items-center gap-2">
            {/* Year selector */}
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-[100px] rounded-xl border-border/60 hover:border-primary/30 transition-colors shadow-sm text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Month selector */}
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-[130px] rounded-xl border-border/60 hover:border-primary/30 transition-colors shadow-sm text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="0">All year</SelectItem>
                {MONTH_LABELS.map((label, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <FlowStat
            icon={PackagePlus}
            label="Incoming Stock"
            value={fmtKg(stats?.inboundPipelineKg, 2)}
            subtext={`Unmatched invoices in ${selectedYear}`}
            delay={0}
          />
          <FlowStat
            icon={Warehouse}
            label="Total Received"
            value={fmtKg(stats?.displayReceived, 2)}
            subtext={selectedMonth === 0 ? `Certified stock received in ${selectedYear}` : `Received in ${periodLabel}`}
            tone="success"
            delay={60}
          />
          <FlowStat
            icon={ShoppingCart}
            label="Used Stock"
            value={fmtKg(stats?.displayConsumed, 2)}
            subtext={selectedMonth === 0 ? `Consumed in ${selectedYear}` : `Consumed in ${periodLabel}`}
            tone="warning"
            delay={120}
          />
          <FlowStat
            icon={TrendingUp}
            label="Closing Balance"
            value={fmtKg(stats?.displayClosing, 2)}
            subtext={`Stock available end of ${periodLabel}`}
            focus
            delay={180}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="surface p-5 animate-fadeInUp" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Monthly stock movement</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedYear} received vs consumed</p>
            </div>
            <Link to="/lots" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors group">
              View lots <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          <div className="h-64">
            {hasMovementData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats!.monthlyChart}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} strokeOpacity={0.6} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--primary) / 0.04)" }} />
                  <Bar dataKey="receivedKg" name="Received" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="consumedKg" name="Consumed" fill="hsl(var(--warning))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Boxes className="h-8 w-8 opacity-30" />
                <span className="text-sm">No shipment data for {selectedYear}.</span>
                <span className="text-xs opacity-70">Try selecting a different year.</span>
              </div>
            )}
          </div>
        </div>

        <div className="surface p-5 animate-fadeInUp" style={{ animationDelay: "300ms" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Closing stock trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedYear} monthly closing balance</p>
            </div>
            <Link to="/consumption" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors group">
              View consumption <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          <div className="h-64">
            {hasClosingData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats!.monthlyChart}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} strokeOpacity={0.6} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="closingKg" name="Closing" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#areaGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <TrendingUp className="h-8 w-8 opacity-30" />
                <span className="text-sm">No closing balance data for {selectedYear}.</span>
                <span className="text-xs opacity-70">Try selecting a different year.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="surface p-5 mt-4 animate-fadeInUp" style={{ animationDelay: "360ms" }}>
        <h3 className="text-sm font-semibold mb-3">Quick actions</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { to: "/upload", icon: FileText, label: "Upload TC" },
            { to: "/live-stock", icon: PackagePlus, label: "Live stock" },
            { to: "/lots", icon: Package, label: "Browse stock" },
            { to: "/consumption/new", icon: ShoppingCart, label: "Record consumption" },
          ].map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:border-primary/20 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.04] transition-all duration-300 group"
            >
              <div className="h-9 w-9 rounded-xl bg-primary/8 text-primary flex items-center justify-center group-hover:bg-primary/12 transition-colors duration-300 shrink-0">
                <action.icon className="h-4 w-4" />
              </div>
              <span className="text-sm">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

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
