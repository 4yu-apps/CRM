"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { activeDataSource, getRepo } from "./repo";
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
  // null = ainda verificando; true = tem perfil de busca; false = precisa de onboarding
  hasProfile: boolean | null;
  isAdmin: boolean;
  // Reavalia o perfil (chamar depois de salvar a Configuracao pra liberar o gate)
  refreshProfile: () => Promise<void>;
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
  // mock ja tem perfil demo; supabase comeca como "verificando" (null)
  const [hasProfile, setHasProfile] = useState<boolean | null>(mode === "mock" ? true : null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

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

  const refreshProfile = useCallback(async () => {
    if (mode !== "supabase") {
      setHasProfile(true);
      return;
    }
    try {
      const profile = await getRepo().getProfile();
      setHasProfile(!!profile);
      setIsAdmin(profile?.is_admin === true);
    } catch {
      // erro de leitura do perfil nao bloqueia o app
      setHasProfile(true);
      setIsAdmin(false);
    }
  }, [mode]);

  // Verifica o perfil quando o usuario entra; limpa ao sair. O setState fica
  // dentro de uma funcao async (nao sincrono no corpo do effect) pra respeitar
  // a regra de lint set-state-in-effect.
  useEffect(() => {
    if (mode !== "supabase") return;
    let alive = true;
    void (async () => {
      if (!user) {
        if (alive) setHasProfile(null);
        return;
      }
      await refreshProfile();
    })();
    return () => {
      alive = false;
    };
  }, [mode, user, refreshProfile]);

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
        // access_type=offline + prompt=consent fazem o Google devolver tambem o
        // refresh token e reemitir o consentimento do escopo de calendario, em
        // vez de pular a tela. Sem isso o provider_token costuma vir so na
        // primeira vez e expira sem renovacao.
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
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
    setHasProfile(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, mode, hasProfile, isAdmin, refreshProfile, signIn, signUp, signInWithGoogle, signOut }}
    >
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
