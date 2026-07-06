import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Leaf } from "lucide-react";
import { isLocalBackend } from "@/lib/backendMode";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, authError } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Leaf className="h-5 w-5 animate-pulse" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }
  if (!user && isLocalBackend) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <Leaf className="h-8 w-8 text-primary mx-auto mb-3" />
          <h1 className="text-lg font-semibold">Could not open CertiStock</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {authError || "The existing Yes Fashion account could not be loaded."}
          </p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}


