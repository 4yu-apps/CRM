"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { activeDataSource } from "./repo";
import { getSupabase } from "./supabase/client";

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  mode: "mock" | "supabase";
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// No modo mock nao ha login real: entra como usuario demo.
const DEMO_USER: AuthUser = { id: "demo", email: "demo@garimpo.local" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode = activeDataSource();
  const [user, setUser] = useState<AuthUser | null>(mode === "mock" ? DEMO_USER : null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(mode === "supabase");

  useEffect(() => {
    if (mode !== "supabase") return;
    const sb = getSupabase();
    let unsub = () => {};
    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(toUser(data.session));
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(toUser(sess));
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

  const signUp = async (email: string, password: string) => {
    if (mode === "mock") {
      setUser(DEMO_USER);
      return;
    }
    const { error } = await getSupabase().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
  };

  const signInWithGoogle = async () => {
    if (mode === "mock") {
      setUser(DEMO_USER);
      return;
    }
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/`
        : undefined;
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "openid email profile https://www.googleapis.com/auth/calendar.events",
        redirectTo,
      },
    });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    if (mode === "mock") {
      setUser(DEMO_USER);
      return;
    }
    await getSupabase().auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, mode, signIn, signUp, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

function toUser(sess: { user: { id: string; email?: string } } | null): AuthUser | null {
  return sess ? { id: sess.user.id, email: sess.user.email ?? null } : null;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
