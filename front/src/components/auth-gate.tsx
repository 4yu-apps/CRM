"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getRepo } from "@/lib/repo";

// Gate de autenticacao e onboarding:
//   - sem sessao fora de /login -> redireciona pra /login
//   - com sessao mas sem perfil cadastrado -> redireciona pra /config (onboarding)
//   - modo mock nunca bloqueia (usuario demo, perfil demo ja existe)
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, mode } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // null = ainda verificando; true = tem perfil; false = nao tem
  const [hasProfile, setHasProfile] = useState<boolean | null>(mode === "mock" ? true : null);
  // Ref para evitar setState sincrono dentro do effect (regra react-hooks/set-state-in-effect)
  const checkingRef = useRef(false);

  // Verifica perfil assim que o usuario logar (supabase mode)
  useEffect(() => {
    if (mode !== "supabase" || !user) return;
    if (checkingRef.current) return;
    checkingRef.current = true;

    let alive = true;
    getRepo()
      .getProfile()
      .then((profile) => {
        if (!alive) return;
        setHasProfile(!!profile);
      })
      .catch(() => {
        // Em caso de erro na leitura do perfil, deixa passar (nao bloqueia)
        if (!alive) return;
        setHasProfile(true);
      })
      .finally(() => {
        checkingRef.current = false;
      });
    return () => {
      alive = false;
    };
  }, [mode, user]);

  // Sem sessao: manda pro login
  const needsLogin = mode === "supabase" && !loading && !user && pathname !== "/login";

  // Com sessao mas sem perfil: manda pro config (onboarding), exceto se ja estiver la
  const needsOnboarding =
    mode === "supabase" &&
    !loading &&
    !!user &&
    hasProfile === false &&
    pathname !== "/config" &&
    pathname !== "/login";

  // Ainda resolvendo sessao ou perfil: renderiza nada para evitar flash
  const isResolving =
    mode === "supabase" && (loading || (!!user && hasProfile === null));

  useEffect(() => {
    if (needsLogin) router.replace("/login");
  }, [needsLogin, router]);

  useEffect(() => {
    if (needsOnboarding) router.replace("/config");
  }, [needsOnboarding, router]);

  if (isResolving) return null;
  if (needsLogin) return null;
  if (needsOnboarding) return null;
  return <>{children}</>;
}
