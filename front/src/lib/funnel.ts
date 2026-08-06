// Métricas do funil — lógica pura sobre o status ATUAL dos leads (instantâneo).
// (Funil cumulativo de verdade viria do lead_status_history; aqui é snapshot.)
import type { Lead, LeadStatus } from "./types";

// Escada principal do funil (off-ramps ficam de fora: descartado/sem_interesse/perdido).
export const LADDER: LeadStatus[] = [
  "bruto",
  "enriquecido",
  "qualificado",
  "rascunho_pronto",
  "aprovado",
  "enviado",
  "respondeu",
  "interessado",
  "reuniao",
  "proposta",
  "fechado",
];

const OFF_RAMP: LeadStatus[] = ["descartado", "sem_interesse", "perdido"];

export function depth(status: LeadStatus): number {
  // Cliente que cancelou CHEGOU em fechado: o negocio fechou, faturou, e depois
  // acabou. Deixar ele fora da escada faria a taxa de conversao cair toda vez
  // que alguem sai, misturando duas medidas que nao tem nada a ver: quao bem eu
  // prospecto, e quao bem eu seguro cliente.
  if (status === "cancelado") return LADDER.indexOf("fechado");
  return LADDER.indexOf(status); // -1 se off-ramp
}

export interface FunnelStage {
  status: LeadStatus;
  label: string;
  reached: number; // leads no estágio ou além
  conversion: number | null; // vs. estágio anterior (0..1)
}

const LABELS: Record<LeadStatus, string> = {
  bruto: "Captado",
  enriquecido: "Enriquecido",
  qualificado: "Qualificado",
  rascunho_pronto: "Rascunho",
  aprovado: "Aprovado",
  enviado: "Enviado",
  sem_resposta: "Sem resposta",
  respondeu: "Respondeu",
  interessado: "Interessado",
  reuniao: "Reuniao",
  proposta: "Proposta",
  fechado: "Fechado",
  cancelado: "Cancelado",
  descartado: "Descartado",
  sem_interesse: "Sem interesse",
  perdido: "Perdido",
};

export function funnel(leads: Lead[]): FunnelStage[] {
  const depths = leads.map((l) => depth(l.status)).filter((d) => d >= 0);
  let prev = 0;
  return LADDER.map((status, i) => {
    const reached = depths.filter((d) => d >= i).length;
    const conversion = i === 0 ? null : prev === 0 ? null : reached / prev;
    prev = reached;
    return { status, label: LABELS[status], reached, conversion };
  });
}

export interface FunnelKpis {
  total: number;
  qualificados: number;
  enviados: number;
  responderam: number;
  reunioes: number;
  fechados: number;
  perdidos: number;
  taxaResposta: number; // responderam / enviados
  taxaFechamento: number; // fechados / enviados
}

const atLeast = (leads: Lead[], status: LeadStatus) => {
  const d = depth(status);
  return leads.filter((l) => depth(l.status) >= d).length;
};

export function kpis(leads: Lead[]): FunnelKpis {
  const enviados = atLeast(leads, "enviado");
  const responderam = atLeast(leads, "respondeu");
  // "Fechados" aqui e conversao: inclui quem cancelou depois, porque o negocio
  // fechou de verdade. A carteira de hoje (MRR, clientes ativos) sai de
  // clients.ts, que conta so quem continua.
  const fechados = leads.filter((l) => l.status === "fechado" || l.status === "cancelado").length;
  return {
    total: leads.length,
    qualificados: atLeast(leads, "qualificado"),
    enviados,
    responderam,
    reunioes: atLeast(leads, "reuniao"),
    fechados,
    perdidos: leads.filter((l) => OFF_RAMP.includes(l.status)).length,
    taxaResposta: enviados ? responderam / enviados : 0,
    taxaFechamento: enviados ? fechados / enviados : 0,
  };
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
