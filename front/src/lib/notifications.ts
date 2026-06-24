// #4 — Central de notificacoes (in-app). Deriva TODOS os gatilhos a partir dos
// leads, sem backend: respondeu, reuniao proxima, follow-up vencendo, leads
// esfriando e novos prontos na fila. Alimenta o sininho do app-shell.
// Obs: notificacao com o app FECHADO (web push real) fica pra depois (precisa
// service worker + VAPID + cron de envio); aqui e o hub in-app que ja resolve
// o "o que exige minha atencao agora".
import type { Lead } from "./types";
import { meetingsWithin, fmtMeetingWhen } from "./meetings";
import { daysUntilRenewal } from "./clients";

export type NotifKind = "respondeu" | "reuniao" | "followup" | "renovacao" | "esfriando" | "fila";

export interface NotifItem {
  id: string;
  kind: NotifKind;
  leadId?: string;
  title: string;
  detail: string;
  href: string;
  ts: number; // momento do evento (ordenacao)
}

export interface NotifGroup {
  kind: NotifKind;
  label: string;
  items: NotifItem[];
}

const DAY = 86_400_000;
const FINAIS = ["fechado", "perdido", "sem_interesse", "descartado"];

export const NOTIF_LABEL: Record<NotifKind, string> = {
  respondeu: "Responderam",
  reuniao: "Reuniões (24h)",
  followup: "Follow-ups de hoje",
  renovacao: "Renovações de contrato",
  esfriando: "Esfriando",
  fila: "Prontos pra revisar",
};

// Ordem de prioridade dos grupos no painel.
const ORDER: NotifKind[] = ["respondeu", "reuniao", "followup", "renovacao", "esfriando", "fila"];

export function buildNotifications(leads: Lead[], coolingDays = 5): NotifItem[] {
  const out: NotifItem[] = [];
  const now = Date.now();
  const d = new Date();
  const fimHoje = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  const limiteFrio = now - coolingDays * DAY;

  for (const l of leads) {
    if (l.archived) continue;

    // renovacao de contrato proxima (<= 30 dias) ou vencida (#16)
    if (l.status === "fechado") {
      const dr = daysUntilRenewal(l);
      if (dr !== null && dr <= 30) {
        out.push({
          id: `ren-${l.id}`,
          kind: "renovacao",
          leadId: l.id,
          title: l.business_name ?? "Cliente",
          detail: dr < 0 ? `contrato venceu há ${-dr}d` : dr === 0 ? "contrato vence hoje" : `renova em ${dr}d`,
          href: `/ficha/${l.id}`,
          ts: now,
        });
      }
    }

    // responderam (precisa da sua resposta)
    if (l.status === "respondeu" || l.status === "interessado") {
      out.push({
        id: `resp-${l.id}`,
        kind: "respondeu",
        leadId: l.id,
        title: l.business_name ?? "Lead",
        detail: l.status === "interessado" ? "demonstrou interesse" : "respondeu, te espera",
        href: `/ficha/${l.id}`,
        ts: +new Date(l.updated_at),
      });
    }

    // follow-up vencendo hoje ou atrasado
    if (l.followup_at && !FINAIS.includes(l.status)) {
      const due = +new Date(l.followup_at);
      if (due <= fimHoje) {
        out.push({
          id: `fup-${l.id}`,
          kind: "followup",
          leadId: l.id,
          title: l.business_name ?? "Lead",
          detail: due < now - DAY ? "follow-up atrasado" : "follow-up pra hoje",
          href: `/ficha/${l.id}`,
          ts: due,
        });
      }
    }

    // esfriando: enviado/sem resposta, sem lembrete, sem toque ha N+ dias
    if (
      (l.status === "enviado" || l.status === "sem_resposta") &&
      !l.followup_at &&
      +new Date(l.updated_at) < limiteFrio
    ) {
      const dias = Math.floor((now - +new Date(l.updated_at)) / DAY);
      out.push({
        id: `cold-${l.id}`,
        kind: "esfriando",
        leadId: l.id,
        title: l.business_name ?? "Lead",
        detail: `sem toque há ${dias} dias`,
        href: `/ficha/${l.id}`,
        ts: +new Date(l.updated_at),
      });
    }
  }

  // reunioes nas proximas 24h
  for (const m of meetingsWithin(leads, 24)) {
    out.push({
      id: `reu-${m.lead.id}`,
      kind: "reuniao",
      leadId: m.lead.id,
      title: m.lead.business_name ?? "Lead",
      detail: fmtMeetingWhen(m.at),
      href: `/ficha/${m.lead.id}`,
      ts: m.at.getTime(),
    });
  }

  // novos prontos na fila (1 item agregado)
  const prontos = leads.filter((l) => l.status === "rascunho_pronto" && !l.archived).length;
  if (prontos > 0) {
    out.push({
      id: "fila",
      kind: "fila",
      title: `${prontos} ${prontos === 1 ? "lead pronto" : "leads prontos"} pra revisar`,
      detail: "na fila de aprovação",
      href: "/fila",
      ts: now,
    });
  }

  return out.sort((a, b) => b.ts - a.ts);
}

export function groupNotifications(items: NotifItem[]): NotifGroup[] {
  return ORDER.map((kind) => ({
    kind,
    label: NOTIF_LABEL[kind],
    items: items.filter((i) => i.kind === kind),
  })).filter((g) => g.items.length > 0);
}
