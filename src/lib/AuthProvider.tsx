import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

interface AuthSession {
  userId: string;
  accessToken: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

interface RawSession {
  user: { id: string } | null;
  access_token: string;
}

function toAuthSession(raw: RawSession | null): AuthSession | null {
  if (!raw || !raw.user) return null;
  return { userId: raw.user.id, accessToken: raw.access_token };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(toAuthSession(data.session as RawSession | null));
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(toAuthSession(newSession as RawSession | null));
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
