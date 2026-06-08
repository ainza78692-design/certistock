import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isLocalBackend } from "@/lib/backendMode";
import { localApi } from "@/lib/localApi";
import { Search, Package, PackagePlus, ShoppingCart, Truck, FileText, Users, Boxes } from "lucide-react";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtKg } from "@/lib/format";

/** Safely truncate a string to maxLen characters */
const truncate = (s: string | null | undefined, maxLen = 50) => {
  if (!s) return "";
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
};

const emptyLocalResults = {
  incomingStock: [],
  stockLots: [],
  certificates: [],
  consumptions: [],
  suppliers: [],
  customers: [],
  products: [],
};

type SourceFilter = "all" | "incoming" | "lots" | "tcs" | "consumptions" | "products" | "suppliers" | "customers";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeSource, setActiveSource] = useState<SourceFilter>("all");
  const navigate = useNavigate();
  const { profile } = useAuth();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!open) setActiveSource("all");
  }, [open]);

  const {
    data: localResults = emptyLocalResults,
    isError: localSearchIsError,
    error: localSearchError,
  } = useQuery({
    queryKey: ["global_search", profile?.company_id, debouncedSearch],
    enabled: isLocalBackend && open && !!profile?.company_id,
    queryFn: async () => localApi<typeof emptyLocalResults>(`/api/search?q=${encodeURIComponent(debouncedSearch.trim())}`),
  });

  const { data: cloudLots = [] } = useQuery({
    queryKey: ["search_lots", profile?.company_id],
    enabled: !isLocalBackend && open && !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_lots")
        .select("id, normalized_yarn_key, article_no, remaining_stock_kg, transaction_certificates(tc_number)")
        .eq("company_id", profile!.company_id!)
        .limit(20);
      return data || [];
    },
  });

  const { data: cloudIncomingStock = [] } = useQuery({
    queryKey: ["search_incoming_stock", profile?.company_id],
    enabled: !isLocalBackend && open && !!profile?.company_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("incoming_stock")
        .select("id, invoice_no, yarn_count, normalized_yarn_key, net_weight_kg, shipment_date, created_at")
        .eq("company_id", profile!.company_id!)
        .is("matched_tc_id", null)
        .order("shipment_date", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const { data: cloudConsumptions = [] } = useQuery({
    queryKey: ["search_consumptions", profile?.company_id],
    enabled: !isLocalBackend && open && !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("consumption_entries")
        .select("id, consumed_weight_kg, consumption_date, product_lots(normalized_yarn_key)")
        .eq("company_id", profile!.company_id!)
        .limit(20);
      return data || [];
    },
  });

  const { data: cloudTcs = [] } = useQuery({
    queryKey: ["search_tcs", profile?.company_id],
    enabled: !isLocalBackend && open && !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("transaction_certificates")
        .select("id, tc_number, suppliers(supplier_name)")
        .eq("company_id", profile!.company_id!)
        .limit(20);
      return data || [];
    },
  });

  const { data: cloudSuppliers = [] } = useQuery({
    queryKey: ["search_suppliers", profile?.company_id],
    enabled: !isLocalBackend && open && !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, supplier_name")
        .eq("company_id", profile!.company_id!)
        .limit(20);
      return data || [];
    },
  });

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  const normalizedSearch = search.trim().toUpperCase().replace(/\s+/g, "");
  const isProductKeySearch = /^(?:\d{1,3}|\d{1,3}D|\d{1,3}\/\d{1,3})$/.test(normalizedSearch);
  const containsSearch = (...values: Array<string | null | undefined>) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return values.some((value) => (value || "").toLowerCase().includes(q));
  };
  const matchesProductKey = (key?: string | null) => {
    if (!search.trim()) return true;
    const normalizedKey = (key || "").toUpperCase().replace(/\s+/g, "");
    if (isProductKeySearch) return normalizedKey === normalizedSearch || normalizedKey.startsWith(normalizedSearch);
    return normalizedKey.includes(normalizedSearch);
  };
  const tcNumberOf = (row: any) => row.transaction_certificates?.tc_number || row.tc_number || "";
  const supplierNameOf = (row: any) => row.transaction_certificates?.suppliers?.supplier_name || row.suppliers?.supplier_name || row.supplier_name || "";

  const lots = isLocalBackend ? localResults.stockLots : cloudLots;
  const incomingStock = isLocalBackend ? localResults.incomingStock : cloudIncomingStock;
  const tcs = isLocalBackend ? localResults.certificates : cloudTcs;
  const consumptions = isLocalBackend ? localResults.consumptions : cloudConsumptions;
  const suppliers = isLocalBackend ? localResults.suppliers : cloudSuppliers;
  const customers = isLocalBackend ? localResults.customers : [];
  const products = isLocalBackend ? localResults.products : [];

  const filteredLots = (isLocalBackend ? lots : lots.filter((lot: any) => {
    if (isProductKeySearch) return matchesProductKey(lot.normalized_yarn_key);
    return matchesProductKey(lot.normalized_yarn_key)
      || containsSearch(lot.article_no, tcNumberOf(lot), supplierNameOf(lot), lot.shipments?.shipment_no);
  })).slice(0, 10);
  const filteredIncomingStock = (isLocalBackend ? incomingStock : incomingStock.filter((stock: any) => {
    if (isProductKeySearch) return containsSearch(stock.invoice_no) || matchesProductKey(stock.normalized_yarn_key);
    return matchesProductKey(stock.normalized_yarn_key)
      || containsSearch(stock.invoice_no, stock.yarn_count, stock.shipment_date);
  })).slice(0, 10);
  const filteredTcs = (isLocalBackend ? tcs : tcs.filter((tc: any) => containsSearch(tc.tc_number, tc.suppliers?.supplier_name, tc.supplier_name))).slice(0, 10);
  const filteredConsumptions = (isLocalBackend ? consumptions : consumptions.filter((c: any) => {
    if (isProductKeySearch) return matchesProductKey(c.product_lots?.normalized_yarn_key);
    return matchesProductKey(c.product_lots?.normalized_yarn_key)
      || containsSearch(
        c.consumption_date,
        c.product_lots?.article_no,
        c.product_lots?.shipments?.shipment_no,
        c.product_lots?.transaction_certificates?.tc_number,
        c.outward_sales?.customer_name_snapshot,
        c.outward_sales?.outward_invoice_no,
      );
  })).slice(0, 10);
  const filteredSuppliers = (isLocalBackend ? suppliers : suppliers.filter((s: any) => containsSearch(s.supplier_name))).slice(0, 10);
  const filteredCustomers = customers.slice(0, 10);
  const filteredProducts = products.slice(0, 10);
  const sourceCounts: Record<SourceFilter, number> = {
    all: filteredIncomingStock.length + filteredLots.length + filteredTcs.length + filteredConsumptions.length + filteredProducts.length + filteredSuppliers.length + filteredCustomers.length,
    incoming: filteredIncomingStock.length,
    lots: filteredLots.length,
    tcs: filteredTcs.length,
    consumptions: filteredConsumptions.length,
    products: filteredProducts.length,
    suppliers: filteredSuppliers.length,
    customers: filteredCustomers.length,
  };
  const sourceFilters: Array<{ id: SourceFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "incoming", label: "Live Stock" },
    { id: "lots", label: "Certified Stock" },
    { id: "tcs", label: "TCs" },
    { id: "consumptions", label: "Consumption" },
    { id: "products", label: "Products" },
    { id: "suppliers", label: "Suppliers" },
    { id: "customers", label: "Customers" },
  ];
  const hasAnyResults = sourceCounts.all > 0;
  const hasVisibleResults = sourceCounts[activeSource] > 0;
  const showGroup = (source: SourceFilter) => activeSource === "all" || activeSource === source;
  const activeSourceLabel = sourceFilters.find((filter) => filter.id === activeSource)?.label || "Results";
  const showSearchError = isLocalBackend && localSearchIsError;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/40 hover:bg-muted/80 border border-transparent rounded-xl transition-all duration-300 flex-1 max-w-xl group focus:outline-none focus:ring-1 focus:ring-primary/20 focus:bg-card"
      >
        <Search className="h-4 w-4 group-hover:text-primary transition-colors" />
        <span className="flex-1 text-left opacity-70">Search across everything...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex shadow-sm">
          <span className="text-xs">Ctrl</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder="Type product key, invoice, TC number, or supplier..."
        />
        <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2">
          {sourceFilters.map((filter) => {
            const isActive = activeSource === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveSource(filter.id)}
                className={[
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  isActive
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                ].join(" ")}
              >
                <span>{filter.label}</span>
                <span className={isActive ? "text-primary/80" : "text-muted-foreground/80"}>{sourceCounts[filter.id]}</span>
              </button>
            );
          })}
        </div>
        <CommandList className="max-h-[400px]">
          {showSearchError && (
            <div className="px-4 py-6 text-center text-sm text-destructive">
              Search service is not available. Restart the local stack and try again.
              <div className="mt-1 text-xs text-muted-foreground">
                {(localSearchError as Error)?.message}
              </div>
            </div>
          )}

          {!showSearchError && !hasAnyResults && (
            <div className="py-6 text-center text-sm text-muted-foreground">No results found.</div>
          )}

          {!showSearchError && hasAnyResults && !hasVisibleResults && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No {activeSourceLabel} matches.
              <button type="button" onClick={() => setActiveSource("all")} className="ml-1 font-medium text-primary hover:underline">
                Try All.
              </button>
            </div>
          )}
          
          {showGroup("incoming") && filteredIncomingStock.length > 0 && (
            <CommandGroup heading="Live Stock / Pending TC">
              {filteredIncomingStock.map((stock: any) => (
                <CommandItem
                  key={stock.id}
                  value={`incoming-${stock.invoice_no || ""}-${stock.normalized_yarn_key || ""}`}
                  keywords={[stock.invoice_no || "", stock.yarn_count || "", stock.normalized_yarn_key || ""]}
                  onSelect={() => runCommand(() => navigate(`/live-stock?q=${encodeURIComponent(stock.invoice_no || stock.normalized_yarn_key || "")}`))}
                  className="flex items-center justify-between py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PackagePlus className="h-4 w-4 text-primary/60 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium font-mono text-sm truncate">{truncate(stock.invoice_no, 34)}</span>
                        <Badge variant="outline" className="font-normal text-[10px] px-1.5 shrink-0">Pending TC</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {truncate(stock.normalized_yarn_key || stock.yarn_count, 46)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0 ml-3">
                    <span className="text-muted-foreground">{fmtDate(stock.shipment_date)}</span>
                    <Badge variant="secondary" className="font-normal text-[10px] px-1.5">{fmtKg(Number(stock.net_weight_kg || 0), 2)}</Badge>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {showGroup("lots") && filteredLots.length > 0 && (
            <>
              {activeSource === "all" && filteredIncomingStock.length > 0 && <CommandSeparator />}
              <CommandGroup heading="Certified Stock Lots">
              {filteredLots.map((lot) => (
                <CommandItem
                  key={lot.id}
                  value={`lot-${lot.normalized_yarn_key || ""}-${lot.article_no || ""}`}
                  keywords={[lot.normalized_yarn_key || "", lot.article_no || "", lot.transaction_certificates?.tc_number || ""]}
                  onSelect={() => runCommand(() => navigate(lot.id ? `/lots/${lot.id}` : `/lots?q=${encodeURIComponent(lot.normalized_yarn_key || "")}`))}
                  className="flex items-center justify-between py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Package className="h-4 w-4 text-primary/60 shrink-0" />
                    <span className="font-medium text-sm truncate">{truncate(lot.normalized_yarn_key, 40)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0 ml-3">
                    <span className="text-muted-foreground font-mono">{lot.transaction_certificates?.tc_number}</span>
                    <Badge variant="secondary" className="font-normal text-[10px] px-1.5">{lot.remaining_stock_kg} kg</Badge>
                  </div>
                </CommandItem>
              ))}
              </CommandGroup>
            </>
          )}

          {showGroup("tcs") && filteredTcs.length > 0 && (
            <>
              {activeSource === "all" && (filteredIncomingStock.length > 0 || filteredLots.length > 0) && <CommandSeparator />}
              <CommandGroup heading="Transaction Certificates">
                {filteredTcs.map((tc) => (
                  <CommandItem
                    key={tc.id}
                    value={`tc-${tc.tc_number || ""}`}
                    keywords={[tc.tc_number || "", tc.suppliers?.supplier_name || ""]}
                    onSelect={() => runCommand(() => navigate(`/lots?q=${encodeURIComponent(tc.tc_number || "")}`))}
                    className="py-2.5"
                  >
                    <FileText className="h-4 w-4 mr-2.5 text-primary/60 shrink-0" />
                    <span className="font-medium font-mono text-sm">{tc.tc_number}</span>
                    {tc.suppliers?.supplier_name && (
                      <span className="text-xs text-muted-foreground ml-2 truncate">- {truncate(tc.suppliers.supplier_name, 35)}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {showGroup("products") && filteredProducts.length > 0 && (
            <>
              {activeSource === "all" && (filteredIncomingStock.length > 0 || filteredLots.length > 0 || filteredTcs.length > 0) && <CommandSeparator />}
              <CommandGroup heading="Product Master">
                {filteredProducts.map((product: any) => (
                  <CommandItem
                    key={product.id}
                    value={`product-${product.normalized_key || ""}`}
                    keywords={[product.normalized_key || "", product.display_name || ""]}
                    onSelect={() => runCommand(() => navigate(`/products`))}
                    className="py-2.5"
                  >
                    <Boxes className="h-4 w-4 mr-2.5 text-primary/60 shrink-0" />
                    <span className="font-medium text-sm">{product.normalized_key}</span>
                    {product.display_name && (
                      <span className="text-xs text-muted-foreground ml-2 truncate">- {truncate(product.display_name, 40)}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {showGroup("consumptions") && filteredConsumptions.length > 0 && (
            <>
              {activeSource === "all" && (filteredIncomingStock.length > 0 || filteredLots.length > 0 || filteredTcs.length > 0 || filteredProducts.length > 0) && <CommandSeparator />}
              <CommandGroup heading="Recent Consumptions">
                {filteredConsumptions.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`consumption-${c.product_lots?.normalized_yarn_key || ""}-${c.consumption_date || ""}`}
                    keywords={[c.product_lots?.normalized_yarn_key || "", c.consumption_date || ""]}
                    onSelect={() => runCommand(() => navigate(`/consumption`))}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ShoppingCart className="h-4 w-4 text-primary/60 shrink-0" />
                      <span className="font-medium text-sm truncate">{truncate(c.product_lots?.normalized_yarn_key, 35) || "Unknown Product"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 ml-3">
                      <span>{c.consumption_date}</span>
                      <span className="font-medium text-foreground tabular-nums">{c.consumed_weight_kg} kg</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {showGroup("suppliers") && filteredSuppliers.length > 0 && (
            <>
              {activeSource === "all" && (filteredIncomingStock.length > 0 || filteredLots.length > 0 || filteredTcs.length > 0 || filteredProducts.length > 0 || filteredConsumptions.length > 0) && <CommandSeparator />}
              <CommandGroup heading="Suppliers">
                {filteredSuppliers.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`supplier-${s.supplier_name?.split(" ").slice(0, 4).join(" ") || ""}`}
                    keywords={[s.supplier_name || ""]}
                    onSelect={() => runCommand(() => navigate(`/lots?q=${encodeURIComponent(s.supplier_name)}`))}
                    className="py-2.5"
                  >
                    <Truck className="h-4 w-4 mr-2.5 text-primary/60 shrink-0" />
                    <span className="font-medium text-sm truncate">{truncate(s.supplier_name, 50)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {showGroup("customers") && filteredCustomers.length > 0 && (
            <>
              {activeSource === "all" && (filteredIncomingStock.length > 0 || filteredLots.length > 0 || filteredTcs.length > 0 || filteredProducts.length > 0 || filteredConsumptions.length > 0 || filteredSuppliers.length > 0) && <CommandSeparator />}
              <CommandGroup heading="Customers">
                {filteredCustomers.map((customer: any) => (
                  <CommandItem
                    key={customer.id}
                    value={`customer-${customer.customer_name || ""}`}
                    keywords={[customer.customer_name || "", customer.te_id || ""]}
                    onSelect={() => runCommand(() => navigate(`/customers`))}
                    className="py-2.5"
                  >
                    <Users className="h-4 w-4 mr-2.5 text-primary/60 shrink-0" />
                    <span className="font-medium text-sm truncate">{truncate(customer.customer_name, 50)}</span>
                    {customer.te_id && <span className="text-xs text-muted-foreground ml-2">{customer.te_id}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
