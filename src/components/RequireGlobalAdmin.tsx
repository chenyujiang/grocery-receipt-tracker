import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { isGlobalAdmin } from "@/lib/adminApi";
import NotFound from "@/pages/NotFound";

// Issue 15 decision 2: wraps the admin dashboard route. Unlike RequireAuth,
// a failed check renders a plain 404 instead of redirecting to /auth — a
// non-admin (or logged-out visitor) shouldn't be able to tell this route
// is anything other than a page that doesn't exist.
export default function RequireGlobalAdmin({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!session) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    isGlobalAdmin(session.userId)
      .then(setIsAdmin)
      .catch(() => setIsAdmin(false))
      .finally(() => setChecking(false));
  }, [loading, session]);

  if (loading || checking) {
    return null;
  }
  if (!isAdmin) {
    return <NotFound />;
  }
  return <>{children}</>;
}
