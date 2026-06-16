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
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));

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

  const availableYears = useMemo(
    () => getAvailableYears({ shipmentLots: normalizedLots, consumptions: rawData?.consumption || [] }),
    [normalizedLots, rawData],
  );

  const selectedYearNumber = Number(selectedYear);
  const selectedMonthNumber = Number(selectedMonth);

  const monthlyAnalytics = useMemo(
    () => buildMonthlyAnalytics({ shipmentLots: normalizedLots, consumptions: rawData?.consumption || [] }, selectedYearNumber),
    [normalizedLots, rawData, selectedYearNumber],
  );

  const stats = useMemo(() => {
    if (!rawData) return null;

    const selectedPoint = monthlyAnalytics.find((point) => point.month === selectedMonthNumber) || monthlyAnalytics[0];
    const previousPoint = monthlyAnalytics.find((point) => point.month === Math.max(selectedMonthNumber - 1, 1));
    const pctChange = (current: number, previous: number) => {
      if (!previous) return null;
      return ((current - previous) / previous) * 100;
    };

    return {
      selectedPoint,
      openingChange: previousPoint ? pctChange(selectedPoint.openingKg, previousPoint.openingKg) : null,
      receivedChange: previousPoint ? pctChange(selectedPoint.receivedKg, previousPoint.receivedKg) : null,
      consumedChange: previousPoint ? pctChange(selectedPoint.consumedKg, previousPoint.consumedKg) : null,
      closingChange: previousPoint ? pctChange(selectedPoint.closingKg, previousPoint.closingKg) : null,
      active: normalizedLots.filter((lot: any) => lot.status === "active").length,
      lowStock: normalizedLots.filter((lot: any) => Number(lot.remaining_stock_kg) > 0 && Number(lot.remaining_stock_kg) < 100).length,
      pending: rawData.pending,
      inboundPipelineKg: (rawData.incomingStock || []).reduce((sum: number, item: any) => sum + Number(item.net_weight_kg || 0), 0),
      onHandKg: normalizedLots.reduce((sum: number, lot: any) => sum + Number(lot.certified_weight_kg || lot.opening_stock_kg || 0), 0),
      consumedKg: normalizedLots.reduce((sum: number, lot: any) => sum + Number(lot.consumed_stock_kg || 0), 0),
      netAvailableKg: normalizedLots.reduce((sum: number, lot: any) => sum + Number(lot.remaining_stock_kg || 0), 0),
      monthlyChart: monthlyAnalytics.map((point) => ({
        month: point.label,
        receivedKg: Number(point.receivedKg.toFixed(2)),
        consumedKg: Number(point.consumedKg.toFixed(2)),
        closingKg: Number(point.closingKg.toFixed(2)),
      })),
    };
  }, [rawData, monthlyAnalytics, normalizedLots, selectedMonthNumber]);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title={`Welcome back${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        subtitle="Month-wise certified stock movement driven by shipment dates."
        actions={
          <div className="flex items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[120px] rounded-xl">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[140px] rounded-xl">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {monthlyAnalytics.map((point) => (
                  <SelectItem key={point.month} value={String(point.month)}>{point.label}</SelectItem>
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
          <FlowStat icon={PackagePlus} label="Incoming Stock" value={fmtKg(stats?.inboundPipelineKg, 2)} subtext="Stock added from incoming invoices" delay={0} />
          <FlowStat icon={Warehouse} label="Total Stock" value={fmtKg(stats?.onHandKg, 2)} subtext="Total certified stock received" tone="success" delay={60} />
          <FlowStat icon={ShoppingCart} label="Used Stock" value={fmtKg(stats?.consumedKg, 2)} subtext="Stock consumed or sold" tone="warning" delay={120} />
          <FlowStat icon={TrendingUp} label="Available Stock" value={fmtKg(stats?.netAvailableKg, 2)} subtext="Stock currently available" focus delay={180} />
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
            {stats?.monthlyChart?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyChart}>
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
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No stock data for this year.
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
            {stats?.monthlyChart?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.monthlyChart}>
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
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No consumption data for this year.
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
