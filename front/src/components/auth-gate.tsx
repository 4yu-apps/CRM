"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { OnboardingWizard } from "./onboarding-wizard";
import { Landing } from "./landing";

// Gate de autenticacao + primeiro acesso:
//   - deslogado na home ("/") -> mostra a landing publica (nao redireciona)
//   - deslogado em outra rota privada -> redireciona pra /login
//   - logado mas sem profissao escolhida -> wizard de onboarding (bloqueia o app
//     ate a profissao ser salva; a profissao dirige score e copy)
//   - modo mock nunca bloqueia (usuario demo, perfil demo ja completo)
// Rotas publicas: acessiveis sem login e sem passar pelo gate de onboarding
// (login + paginas legais, que precisam abrir deslogado, inclusive pro Google).
const PUBLIC_PATHS = ["/login", "/privacidade", "/termos"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, mode, hasProfile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.includes(pathname);
  // A home ("/") deslogada e a landing publica: nao manda pro login, mostra a LP.
  const isHome = pathname === "/";

  // Deslogado na home: mostra a landing (rota publica de fato, sem redirect).
  const showLanding = mode === "supabase" && !loading && !user && isHome;

  // Sem sessao: manda pro login (exceto em rotas publicas e na home).
  const needsLogin =
    mode === "supabase" && !loading && !user && !isPublic && !isHome;

  // Ainda resolvendo sessao: renderiza nada para evitar flash (rota publica nao espera)
  const isResolving = mode === "supabase" && loading && !isPublic;

  // Logado, fora de rota publica, mas ainda verificando o perfil: segura o render
  // pra nao piscar o app antes do wizard.
  const checkingProfile =
    mode === "supabase" && !!user && !isPublic && hasProfile === null;

  // Primeiro acesso: usuario logado sem profissao no perfil precisa do onboarding.
  const needsOnboarding =
    mode === "supabase" && !!user && !isPublic && hasProfile === false;

  useEffect(() => {
    if (needsLogin) router.replace("/login");
  }, [needsLogin, router]);

  if (isResolving) return null;
  if (showLanding) return <Landing />;
  if (needsLogin) return null;
  if (checkingProfile) return null;
  if (needsOnboarding) return <OnboardingWizard />;
  return <>{children}</>;
}
