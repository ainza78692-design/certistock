import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Upload, FileText, Package, ShoppingCart,
  Users, Truck, Boxes, BarChart3, Settings, Leaf, PackagePlus,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const main = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Live Stock", url: "/live-stock", icon: PackagePlus },
  { title: "Upload PDFs", url: "/upload", icon: Upload },
  { title: "Certificates", url: "/certificates", icon: FileText },
  { title: "Stock lots", url: "/lots", icon: Package },
  { title: "Consumption", url: "/consumption", icon: ShoppingCart },
];

const manage = [
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Suppliers", url: "/suppliers", icon: Truck },
  { title: "Product master", url: "/products", icon: Boxes },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const isActive = (p: string) => p === "/" ? pathname === "/" : pathname.startsWith(p);

  const renderItem = (item: typeof main[number]) => {
    const active = isActive(item.url);
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
          <NavLink
            to={item.url}
            className={`flex items-center gap-3 relative transition-all duration-200 rounded-lg px-2 py-1.5 ${
              active
                ? "text-primary font-medium bg-primary/[0.06]"
                : "text-sidebar-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {active && !collapsed && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-primary" />
            )}
            <item.icon className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${active ? "text-primary" : ""}`} />
            {!collapsed && <span className="text-[13px]">{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Leaf className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-[13px] font-bold tracking-tight text-foreground">CertiStock</span>
              <span className="text-[10px] text-muted-foreground leading-none">Certified stock tracking</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="py-3 px-1.5">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase px-2 mb-1.5">Workflow</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">{main.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-4">
          {!collapsed && <SidebarGroupLabel className="text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase px-2 mb-1.5">Manage</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">{manage.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="flex items-center gap-2 px-1">
            <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-muted-foreground">v1.0 · All systems operational</span>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
