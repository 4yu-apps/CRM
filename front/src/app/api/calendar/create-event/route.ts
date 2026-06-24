// Route Handler (Next.js 16) que cria um evento no Google Calendar do usuario.
//
// Roda no servidor: recebe o access token do Google (provider_token da sessao
// Supabase) no corpo do POST e fala com a Google Calendar API. Assim o token
// nunca aparece na URL nem em log de navegacao, e a chamada externa sai do
// servidor. POST nao e cacheado pelo Next por padrao.
//
// Degrada com graca: nunca lanca erro pro cliente. Sempre devolve um JSON
// { ok, ... } com um "reason" legivel quando algo nao da certo (sem token,
// token expirado, etc.), pra UI escolher um aviso amigavel.

import type { NextRequest } from "next/server";

// Sempre dinamico: nada aqui pode ser pre-renderizado.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LeadPayload {
  business_name?: string | null;
  phone?: string | null;
  service_label?: string | null;
  location?: string | null;
}

interface CreateEventBody {
  accessToken?: string | null;
  lead?: LeadPayload | null;
  dateTimeISO?: string | null;
}

interface OkResult {
  ok: true;
  eventId: string;
  htmlLink?: string | null;
}

interface FailResult {
  ok: false;
  reason: string;
}

const CALENDAR_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// Duracao padrao da reuniao: 1 hora.
const MEETING_DURATION_MS = 60 * 60 * 1000;

function fail(reason: string, status = 200): Response {
  // status 200 de proposito: o "erro" e de negocio, nao de transporte. A UI le
  // o reason e mostra o aviso certo sem quebrar.
  return Response.json({ ok: false, reason } satisfies FailResult, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: CreateEventBody;
  try {
    body = (await request.json()) as CreateEventBody;
  } catch {
    return fail("payload_invalido");
  }

  const accessToken = body.accessToken?.trim();
  if (!accessToken) {
    return fail("sem_token");
  }

  const dateTimeISO = body.dateTimeISO?.trim();
  if (!dateTimeISO) {
    return fail("sem_data");
  }

  const start = new Date(dateTimeISO);
  if (Number.isNaN(start.getTime())) {
    return fail("data_invalida");
  }
  const end = new Date(start.getTime() + MEETING_DURATION_MS);

  const lead = body.lead ?? {};
  const business = lead.business_name?.trim() || "lead";

  // Descricao com telefone e servico, quando existirem.
  const descLines: string[] = ["Reuniao agendada pelo 4YU CRM."];
  if (lead.phone?.trim()) descLines.push(`Telefone: ${lead.phone.trim()}`);
  if (lead.service_label?.trim()) descLines.push(`Servico: ${lead.service_label.trim()}`);
  const place = lead.location?.trim();
  if (place) descLines.push(`Local: ${place}`);

  const event: Record<string, unknown> = {
    summary: `Reuniao com ${business}`,
    description: descLines.join("\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: { useDefault: true },
  };
  // Local do evento: endereco (presencial) ou link (online) vira o "location".
  if (place) event.location = place;

  let res: Response;
  try {
    res = await fetch(CALENDAR_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
  } catch {
    // Falha de rede ao falar com o Google: nao quebra o fluxo do funil.
    return fail("falha_rede");
  }

  // 401/403 = token expirado, revogado ou sem o escopo certo. Tratamos como
  // "precisa reconectar o Google", sem jogar erro vermelho.
  if (res.status === 401 || res.status === 403) {
    return fail("token_expirado");
  }

  if (!res.ok) {
    return fail("google_erro");
  }

  let data: { id?: string; htmlLink?: string };
  try {
    data = (await res.json()) as { id?: string; htmlLink?: string };
  } catch {
    return fail("resposta_invalida");
  }

  if (!data.id) {
    return fail("sem_id");
  }

  return Response.json({
    ok: true,
    eventId: data.id,
    htmlLink: data.htmlLink ?? null,
  } satisfies OkResult);
}
