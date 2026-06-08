import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Upload, LogOut, User, Sun, Moon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { GlobalSearch } from "./GlobalSearch";

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const initials = (profile?.full_name || user?.email || "U")
    .split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* ─── Header ─── */}
          <header className="sticky top-0 z-30 h-14 border-b border-border/60 bg-background/80 backdrop-blur-xl flex items-center gap-3 px-4">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors duration-200" />

            {/* Search */}
            <GlobalSearch />

            {/* Actions */}
            <Button
              size="sm"
              onClick={() => navigate("/upload")}
              className="gap-2 rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
            >
              <Upload className="h-4 w-4" /> Upload
            </Button>

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full text-muted-foreground hover:text-foreground transition-all duration-300"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8 ring-2 ring-transparent hover:ring-primary/20 transition-all duration-300">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{profile?.full_name || "User"}</span>
                    <span className="text-xs text-muted-foreground">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
                  <User className="h-4 w-4 mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* ─── Main content ─── */}
          <main className="flex-1 p-6 lg:p-8 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
