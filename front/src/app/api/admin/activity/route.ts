// src/app/api/admin/activity/route.ts
// Logs de atividade da esteira (busca/enriquecimento/descarte/rascunho) de TODOS
// os usuarios, pro superadmin debugar o que o robo fez por dono. Cross-user exige
// service role (a RLS de activity_log so deixa o dono ver o proprio).
import type { NextRequest } from "next/server";
import { adminClient, requireAdmin } from "@/lib/admin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 300;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "nao_autorizado";
    const status = msg === "sem_token" || msg === "token_invalido" ? 401 : 403;
    return Response.json({ error: msg }, { status });
  }

  const sb = adminClient();

  // filtros opcionais (debug direcionado): ?owner=<uuid> & ?tipo=<tipo> & ?limit=
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner");
  const tipo = url.searchParams.get("tipo");
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  let q = sb
    .from("activity_log")
    .select("id, owner_id, tipo, text, ref_count, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (owner) q = q.eq("owner_id", owner);
  if (tipo) q = q.eq("tipo", tipo);

  const { data: events, error } = await q;
  if (error) {
    return Response.json({ error: "erro_ao_listar_atividade" }, { status: 500 });
  }

  // e-mails via Auth Admin API (mesmo padrao da rota de perfis); se falhar, os
  // e-mails ficam nulos mas a rota nao quebra.
  const emailById = new Map<string, string>();
  try {
    const { data: usersPage } = await sb.auth.admin.listUsers({ perPage: 1000, page: 1 });
    if (usersPage?.users) {
      for (const u of usersPage.users) {
        if (u.email) emailById.set(u.id, u.email);
      }
    }
  } catch {
    // emails vazios, sem quebrar
  }

  const result = (events ?? []).map((a) => ({
    id: a.id as string,
    owner_id: a.owner_id as string,
    email: emailById.get(a.owner_id as string) ?? null,
    tipo: a.tipo as string,
    text: a.text as string,
    ref_count: (a.ref_count as number | null) ?? null,
    created_at: a.created_at as string,
  }));

  return Response.json(result);
}
