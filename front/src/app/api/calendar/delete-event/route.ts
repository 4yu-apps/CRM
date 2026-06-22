// Route Handler (Next.js) que apaga um evento do Google Calendar do usuario.
//
// Roda no servidor: recebe o access token e o eventId no corpo do POST.
// DELETE https://www.googleapis.com/calendar/v3/calendars/primary/events/{eventId}
//
// 401/410 sao tratados como sucesso: o evento ja foi apagado ou o token esta
// invalido, mas o lead ja foi limpo no banco, entao nao ha nada mais a fazer.
// Nunca lanca erro pro cliente — sempre retorna JSON { ok, reason? }.

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DeleteEventBody {
  accessToken?: string | null;
  eventId?: string | null;
}

interface OkResult {
  ok: true;
}

interface FailResult {
  ok: false;
  reason: string;
}

const CALENDAR_BASE =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function fail(reason: string): Response {
  return Response.json({ ok: false, reason } satisfies FailResult);
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: DeleteEventBody;
  try {
    body = (await request.json()) as DeleteEventBody;
  } catch {
    return fail("payload_invalido");
  }

  const accessToken = body.accessToken?.trim();
  if (!accessToken) {
    return fail("sem_token");
  }

  const eventId = body.eventId?.trim();
  if (!eventId) {
    return fail("sem_event_id");
  }

  let res: Response;
  try {
    res = await fetch(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return fail("falha_rede");
  }

  // 204 = apagado com sucesso.
  // 401/410 = token expirado ou evento ja apagado — lead ja limpo, tudo certo.
  // Outros 4xx/5xx = falha, mas best-effort: nao travar o usuario.
  if (res.status === 204 || res.status === 401 || res.status === 410) {
    return Response.json({ ok: true } satisfies OkResult);
  }

  if (res.status === 403) {
    return fail("token_expirado");
  }

  return fail("google_erro");
}
