// src/lib/admin-server.ts
// SERVIDOR APENAS — nunca importar no cliente.
// Usa a SERVICE_ROLE key para bypassar RLS; mantenha fora do bundle do browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Variavel de ambiente ausente: ${key}`);
  return v;
}

// Cliente com service role: bypassa RLS. Nunca exportar pro client.
export function adminClient(): SupabaseClient {
  return createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

// Valida que o chamador e admin:
// 1. Le o Bearer token do header Authorization.
// 2. Verifica o JWT com a anon key (auth.getUser responde sem service role).
// 3. Busca is_admin do perfil via service role (bypassa RLS).
// Lanca Error se nao for admin; o route handler converte pra 401/403.
export async function requireAdmin(req: Request): Promise<{ userId: string }> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("sem_token");

  // Verifica o JWT com client anonimo + header customizado.
  const verifier = createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const { data: { user }, error } = await verifier.auth.getUser();
  if (error || !user) throw new Error("token_invalido");

  const userId = user.id;

  // Confere is_admin no search_profile usando o service role.
  const { data: profile, error: profileErr } = await adminClient()
    .from("search_profile")
    .select("is_admin")
    .eq("owner_id", userId)
    .maybeSingle();

  if (profileErr) throw new Error("erro_perfil");
  if (!profile?.is_admin) throw new Error("sem_permissao");

  return { userId };
}
