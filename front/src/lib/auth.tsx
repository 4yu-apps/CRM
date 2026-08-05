"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { activeDataSource, getRepo } from "./repo";
import type { SearchProfile } from "./types";
import { getSupabase } from "./supabase/client";

export interface AuthUser {
  id: string;
  email: string | null;
  // Nome de exibicao (do user_metadata, coletado no onboarding). Usado na
  // saudacao em vez de derivar do e-mail.
  name: string | null;
  // Foto de perfil (user_metadata.avatar_url). null = mostra iniciais.
  avatar_url: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  mode: "mock" | "supabase";
  // null = ainda verificando; true = perfil pronto (com profissao); false = precisa
  // de onboarding. Perfil sem profissao tambem conta como false: a profissao
  // dirige score e copy, entao o onboarding so libera o app depois de escolhida.
  hasProfile: boolean | null;
  // O perfil inteiro, nao so "existe ou nao". A ficha precisa saber a PROFISSAO
  // do dono pra escolher a leitura (juridica x presenca digital); antes so
  // havia o boolean, e a ficha tinha de adivinhar pelo service_target do lead —
  // que vira "indefinido" em todo lead descartado. null enquanto carrega.
  profile: SearchProfile | null;
  isAdmin: boolean;
  // Reavalia o perfil (chamar depois de salvar a Configuracao pra liberar o gate)
  refreshProfile: () => Promise<void>;
  // Recarrega o usuario da sessao (chamar depois de mudar nome/foto na conta)
  refreshUser: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// No modo mock nao ha login real: entra como usuario demo.
const DEMO_USER: AuthUser = { id: "demo", email: "demo@garimpo.local", name: null, avatar_url: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode = activeDataSource();
  const [user, setUser] = useState<AuthUser | null>(mode === "mock" ? DEMO_USER : null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(mode === "supabase");
  // mock ja tem perfil demo; supabase comeca como "verificando" (null)
  const [hasProfile, setHasProfile] = useState<boolean | null>(mode === "mock" ? true : null);
  const [profile, setProfile] = useState<SearchProfile | null>(null);
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
      // No mock tambem carrega o perfil: a ficha le a profissao dele pra
      // escolher a leitura, e o gate ja esta liberado por outro caminho.
      setHasProfile(true);
      try {
        setProfile(await getRepo().getProfile());
      } catch {
        setProfile(null);
      }
      return;
    }
    try {
      const loaded = await getRepo().getProfile();
      setProfile(loaded);
      // So libera o app quando ha perfil COM profissao escolhida. Aceita tanto
      // professions[] (multi-select) quanto profession (back-compat).
      setHasProfile(!!loaded && (((loaded.professions?.length ?? 0) > 0) || !!loaded.profession));
      setIsAdmin(loaded?.is_admin === true);
    } catch {
      // erro de leitura do perfil nao bloqueia o app
      setHasProfile(true);
      setIsAdmin(false);
    }
  }, [mode]);

  // Verifica o perfil quando o usuario entra; limpa ao sair. O setState fica
  // dentro de uma funcao async (nao sincrono no corpo do effect) pra respeitar
  // a regra de lint set-state-in-effect.
  // Roda tambem no modo mock: la o gate ja esta liberado, mas o PERFIL importa
  // por si (a ficha le a profissao dele pra escolher a leitura do lead).
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!user) {
        if (alive) {
          setHasProfile(null);
          setProfile(null);
          setIsAdmin(false);
        }
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

  // Re-le o usuario da sessao apos editar nome/foto na pagina de conta, pra a
  // UI (saudacao, avatar no app-shell) refletir na hora.
  const refreshUser = useCallback(async () => {
    if (mode !== "supabase") return;
    const { data } = await getSupabase().auth.getUser();
    setUser(data.user ? toUser({ user: data.user }) : null);
  }, [mode]);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, mode, hasProfile, profile, isAdmin, refreshProfile, refreshUser, signIn, signUp, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function toUser(
  sess: {
    user: {
      id: string;
      email?: string;
      user_metadata?: { full_name?: string | null; avatar_url?: string | null };
    };
  } | null,
): AuthUser | null {
  return sess
    ? {
        id: sess.user.id,
        email: sess.user.email ?? null,
        name: sess.user.user_metadata?.full_name ?? null,
        avatar_url: sess.user.user_metadata?.avatar_url ?? null,
      }
    : null;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
