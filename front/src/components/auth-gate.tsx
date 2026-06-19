"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

// Gate de autenticacao:
//   - sem sessao fora de /login -> redireciona pra /login
//   - modo mock nunca bloqueia (usuario demo, perfil demo ja existe)
// O perfil de busca e onboarding leve: a Config cria/atualiza search_profile,
// mas a ausencia dele nao prende a navegacao. Isso evita o loop em /config para
// contas novas ou perfis ainda nao salvos.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, mode } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Sem sessao: manda pro login
  const needsLogin = mode === "supabase" && !loading && !user && pathname !== "/login";

  // Ainda resolvendo sessao: renderiza nada para evitar flash
  const isResolving = mode === "supabase" && loading;

  useEffect(() => {
    if (needsLogin) router.replace("/login");
  }, [needsLogin, router]);

  if (isResolving) return null;
  if (needsLogin) return null;
  return <>{children}</>;
}
