// src/app/api/admin/user/route.ts
import type { NextRequest } from "next/server";
import { adminClient, requireAdmin } from "@/lib/admin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface UserActionBody {
  action: "update_password" | "update_email" | "delete";
  ownerId: string;
  password?: string;
  email?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  let callerId: string;
  try {
    const { userId } = await requireAdmin(request);
    callerId = userId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "nao_autorizado";
    const status = msg === "sem_token" || msg === "token_invalido" ? 401 : 403;
    return Response.json({ error: msg }, { status });
  }

  let body: UserActionBody;
  try {
    body = (await request.json()) as UserActionBody;
  } catch {
    return Response.json({ error: "payload_invalido" }, { status: 400 });
  }

  const { action, ownerId, password, email } = body;

  if (!ownerId) {
    return Response.json({ error: "ownerId_obrigatorio" }, { status: 400 });
  }

  // Protecao: admin nao pode excluir a propria conta.
  if (action === "delete" && ownerId === callerId) {
    return Response.json({ error: "nao_pode_excluir_propria_conta" }, { status: 400 });
  }

  const sb = adminClient();

  if (action === "update_password") {
    if (!password) return Response.json({ error: "senha_obrigatoria" }, { status: 400 });
    const { error } = await sb.auth.admin.updateUserById(ownerId, { password });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (action === "update_email") {
    if (!email) return Response.json({ error: "email_obrigatorio" }, { status: 400 });
    const { error } = await sb.auth.admin.updateUserById(ownerId, { email });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    // Apaga dados do dono na ordem certa (FK pode derrubar filhos automaticamente).
    // Erros parciais sao absorvidos — o try mais externo captura o que importa.
    try {
      await sb.from("leads").delete().eq("owner_id", ownerId);
    } catch { /* ignora erro parcial */ }

    try {
      await sb.from("activity_log").delete().eq("owner_id", ownerId);
    } catch { /* ignora */ }

    try {
      await sb.from("scan_coverage").delete().eq("owner_id", ownerId);
    } catch { /* ignora */ }

    try {
      await sb.from("search_profile").delete().eq("owner_id", ownerId);
    } catch { /* ignora */ }

    // Por ultimo: apaga o usuario do Auth (se falhar, ainda e um erro real).
    const { error: authErr } = await sb.auth.admin.deleteUser(ownerId);
    if (authErr) return Response.json({ error: authErr.message }, { status: 500 });

    return Response.json({ ok: true });
  }

  return Response.json({ error: "acao_desconhecida" }, { status: 400 });
}
