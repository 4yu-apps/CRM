// src/app/api/admin/profiles/route.ts
import type { NextRequest } from "next/server";
import { adminClient, requireAdmin } from "@/lib/admin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  let callerId: string;
  try {
    const { userId } = await requireAdmin(request);
    callerId = userId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "nao_autorizado";
    const status = msg === "sem_token" || msg === "token_invalido" ? 401 : 403;
    return Response.json({ error: msg }, { status });
  }

  // Silencia o aviso de variavel nao usada; callerId pode ser util pra log.
  void callerId;

  const sb = adminClient();

  // a) Todos os perfis
  const { data: profiles, error: profErr } = await sb
    .from("search_profile")
    .select("owner_id, profession, city, state, autopilot, is_admin, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (profErr) {
    return Response.json({ error: "erro_ao_listar_perfis" }, { status: 500 });
  }

  // b) Contagem de leads por owner (todas as linhas, so owner_id)
  const { data: leadsRows, error: leadsErr } = await sb
    .from("leads")
    .select("owner_id");

  const leadsByOwner = new Map<string, number>();
  if (!leadsErr && leadsRows) {
    for (const row of leadsRows as { owner_id: string }[]) {
      leadsByOwner.set(row.owner_id, (leadsByOwner.get(row.owner_id) ?? 0) + 1);
    }
  }

  // c) Ultima atividade por owner
  const { data: actRows, error: actErr } = await sb
    .from("activity_log")
    .select("owner_id, created_at")
    .order("created_at", { ascending: false });

  const lastActivity = new Map<string, string>();
  if (!actErr && actRows) {
    for (const row of actRows as { owner_id: string; created_at: string }[]) {
      if (!lastActivity.has(row.owner_id)) {
        lastActivity.set(row.owner_id, row.created_at);
      }
    }
  }

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
