"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

// Gate de autenticacao e onboarding:
//   - sem sessao fora de /login -> redireciona pra /login
//   - com sessao mas sem perfil cadastrado -> redireciona pra /config (onboarding)
//   - modo mock nunca bloqueia (usuario demo, perfil demo ja existe)
// hasProfile vem do contexto de auth (fonte unica). Depois de salvar a
// Configuracao, o /config chama refreshProfile e o gate libera sem travar.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, mode, hasProfile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

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
  const isResolving = mode === "supabase" && (loading || (!!user && hasProfile === null));

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
