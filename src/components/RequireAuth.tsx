import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthProvider";

// Wraps a page that requires a signed-in user; redirects to /auth otherwise.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }
  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}
