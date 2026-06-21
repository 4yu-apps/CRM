// Helper de cliente pra criar evento no Google Calendar.
//
// Pega o provider_token (access token do Google) da sessao atual do Supabase e
// chama a rota server-side /api/calendar/create-event, que fala com o Google.
// O token sai daqui dentro do corpo de um POST (nunca na URL).
//
// Tudo degrada com graca: se nao houver token (usuario nao conectou o Google,
// ou o modo nao e supabase), devolve { ok:false, reason:'sem_token' } sem
// lancar. Quem chama decide o aviso amigavel.

import { activeDataSource } from "./repo";
import { getSupabase } from "./supabase/client";

export interface CalendarLeadInput {
  business_name?: string | null;
  phone?: string | null;
  service_label?: string | null;
  // endereco (presencial) ou link (online): vira o "local" do evento no Google.
  location?: string | null;
}

export type CreateEventResult =
  | { ok: true; eventId: string; htmlLink?: string | null }
  | { ok: false; reason: string };

/**
 * Cria um evento de reuniao no Google Calendar do usuario.
 *
 * @param lead         dados do lead pro titulo/descricao
 * @param dateTimeISO  inicio da reuniao em ISO (duracao fixa de 1h no server)
 */
export async function createCalendarEvent(
  lead: CalendarLeadInput,
  dateTimeISO: string,
): Promise<CreateEventResult> {
  // No modo mock nao ha sessao real do Google.
  if (activeDataSource() !== "supabase") {
    return { ok: false, reason: "sem_token" };
  }

  let accessToken: string | null = null;
  try {
    const { data } = await getSupabase().auth.getSession();
    // provider_token = access token do Google. So vem logo apos o login OAuth e
    // expira (~1h); o Supabase nao o renova sozinho. Quando ausente, tratamos
    // como "sem token" e a UI orienta reconectar.
    accessToken = data.session?.provider_token ?? null;
  } catch {
    return { ok: false, reason: "sem_token" };
  }

  if (!accessToken) {
    return { ok: false, reason: "sem_token" };
  }

  try {
    const res = await fetch("/api/calendar/create-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, lead, dateTimeISO }),
    });
    const json = (await res.json()) as CreateEventResult;
    return json;
  } catch {
    return { ok: false, reason: "falha_rede" };
  }
}
