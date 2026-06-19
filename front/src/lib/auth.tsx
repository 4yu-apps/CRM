"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { activeDataSource } from "./repo";
import { getSupabase } from "./supabase/client";

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  mode: "mock" | "supabase";
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// No modo mock nao ha login real: entra como usuario demo.
const DEMO_USER: AuthUser = { id: "demo", email: "demo@garimpo.local" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode = activeDataSource();
  const [user, setUser] = useState<AuthUser | null>(mode === "mock" ? DEMO_USER : null);
  const [loading, setLoading] = useState(mode === "supabase");

  useEffect(() => {
    if (mode !== "supabase") return;
    const sb = getSupabase();
    let unsub = () => {};
    void sb.auth.getSession().then(({ data }) => {
      setUser(toUser(data.session));
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session));
    });
    unsub = () => sub.subscription.unsubscribe();
    return () => unsub();
  }, [mode]);

  const signIn = async (email: string, password: string) => {
    if (mode === "mock") {
      setUser(DEMO_USER);
      return;
    }
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    if (mode === "mock") {
      setUser(DEMO_USER);
      return;
    }
    await getSupabase().auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, mode, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

function toUser(session: { user: { id: string; email?: string } } | null): AuthUser | null {
  return session ? { id: session.user.id, email: session.user.email ?? null } : null;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
