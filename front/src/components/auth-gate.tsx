"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

// No modo supabase, exige login: redireciona pra /login quando nao ha sessao.
// No modo mock, nunca bloqueia (usuario demo).
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, mode } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const blocked = mode === "supabase" && !loading && !user && pathname !== "/login";

  useEffect(() => {
    if (blocked) router.replace("/login");
  }, [blocked, router]);

  if (mode === "supabase" && loading) return null;
  if (blocked) return null;
  return <>{children}</>;
}
