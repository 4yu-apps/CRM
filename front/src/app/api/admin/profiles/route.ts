// src/app/api/admin/profiles/route.ts
import type { NextRequest } from "next/server";
import { adminClient, requireAdmin } from "@/lib/admin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "nao_autorizado";
    const status = msg === "sem_token" || msg === "token_invalido" ? 401 : 403;
    return Response.json({ error: msg }, { status });
  }

  const sb = adminClient();

  // a) Todos os perfis
  const { data: profiles, error: profErr } = await sb
    .from("search_profile")
    .select("owner_id, profession, professions, city, state, autopilot, is_admin, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (profErr) {
    return Response.json({ error: "erro_ao_listar_perfis" }, { status: 500 });
  }

  // b+c) Contagem de leads e ultima atividade POR OWNER, com query propria por
  // perfil. Antes: select("owner_id") trazia no maximo 1000 linhas do PostgREST e
  // contava no cliente; com >1000 leads os donos fora das primeiras 1000 linhas
  // zeravam (ex.: gab.feelix com 905 leads aparecia como 0). count exact + head
  // nao trunca.
  const leadsByOwner = new Map<string, number>();
  const lastActivity = new Map<string, string>();
  await Promise.all(
    (profiles ?? []).map(async (p) => {
      const oid = p.owner_id as string;
      const [cnt, act] = await Promise.all([
        sb.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", oid),
        sb
          .from("activity_log")
          .select("created_at")
          .eq("owner_id", oid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      leadsByOwner.set(oid, cnt.count ?? 0);
      const ts = (act.data as { created_at?: string } | null)?.created_at;
      if (ts) lastActivity.set(oid, ts);
    }),
  );

  // d) E-mails via Auth Admin API
  const emailById = new Map<string, string>();
  try {
    const { data: usersPage } = await sb.auth.admin.listUsers({ perPage: 1000, page: 1 });
    if (usersPage?.users) {
      for (const u of usersPage.users) {
        if (u.email) emailById.set(u.id, u.email);
      }
    }
  } catch {
    // se falhar, emails ficam vazios mas nao quebra a rota
  }

  const result = (profiles ?? []).map((p) => ({
    owner_id: p.owner_id as string,
    email: emailById.get(p.owner_id as string) ?? null,
    profession: (p.profession as string | null) ?? null,
    professions: ((p as Record<string, unknown>).professions as string[] | null) ?? [],
    city: (p.city as string | null) ?? null,
    state: (p.state as string | null) ?? null,
    autopilot: p.autopilot as boolean,
    is_admin: (p.is_admin as boolean | null) === true,
    leads_count: leadsByOwner.get(p.owner_id as string) ?? 0,
    last_activity: lastActivity.get(p.owner_id as string) ?? null,
    created_at: p.created_at as string,
  }));

  return Response.json(result);
}
