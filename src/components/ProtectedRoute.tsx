import { ReactNode } from "react";

/**
 * ProtectedRoute is deprecated - all routes are now public in single-user mode.
 * This component is kept for backward compatibility but simply passes through children.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
