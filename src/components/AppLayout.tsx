import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";

export default function AppLayout() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading CertiStock...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-14 border-b border-border/60 bg-background/80 backdrop-blur-xl flex items-center gap-3 px-4 lg:hidden">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors duration-200" />
            <span className="text-sm font-semibold">CertiStock</span>
          </header>
          <main className="flex-1 p-6 lg:p-8 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
