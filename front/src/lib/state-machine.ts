// Maquina de estados do lead — espelha lead_status_transitions (Fase 0).
// Front e banco PRECISAM concordar; o banco e a fonte da verdade (trigger valida).
import type { LeadStatus } from "./types";

// Transicoes permitidas. Igual ao seed em supabase/migrations/...04_transitions.sql.
export const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  bruto: ["enriquecido", "descartado"],
  enriquecido: ["qualificado", "descartado"],
  qualificado: ["rascunho_pronto", "descartado"],
  rascunho_pronto: ["aprovado", "descartado"],
  aprovado: ["enviado"],
  enviado: ["respondeu", "sem_resposta", "descartado"],
  sem_resposta: ["enviado", "descartado"],
  respondeu: ["interessado", "sem_interesse", "reuniao"],
  interessado: ["reuniao", "proposta", "perdido"],
  reuniao: ["proposta", "perdido"],
  proposta: ["fechado", "perdido"],
  // terminais
  descartado: [],
  sem_interesse: [],
  fechado: [],
  perdido: [],
};

// Status que sao "contato" — bloqueados pela guarda LGPD quando opt_out=true.
export const CONTACT_STATUSES: LeadStatus[] = ["rascunho_pronto", "aprovado", "enviado"];

export function nextStatuses(status: LeadStatus): LeadStatus[] {
  return TRANSITIONS[status] ?? [];
}

export function isTerminal(status: LeadStatus): boolean {
  return nextStatuses(status).length === 0;
}

export function canTransition(from: LeadStatus, to: LeadStatus, optOut: boolean): boolean {
  if (!nextStatuses(from).includes(to)) return false;
  if (optOut && CONTACT_STATUSES.includes(to)) return false;
  return true;
}

type Tone = "neutral" | "info" | "warn" | "good" | "bad" | "accent";
type Stage = "captacao" | "esteira" | "rascunho" | "envio" | "conversa" | "ganho" | "saida";

export interface StatusMeta {
  label: string;
  stage: Stage;
  tone: Tone;
}

export const STATUS_META: Record<LeadStatus, StatusMeta> = {
  bruto: { label: "Bruto", stage: "captacao", tone: "neutral" },
  enriquecido: { label: "Enriquecido", stage: "esteira", tone: "info" },
  qualificado: { label: "Qualificado", stage: "esteira", tone: "info" },
  rascunho_pronto: { label: "Rascunho pronto", stage: "rascunho", tone: "accent" },
  aprovado: { label: "Aprovado", stage: "rascunho", tone: "accent" },
  enviado: { label: "Enviado", stage: "envio", tone: "warn" },
  sem_resposta: { label: "Sem resposta", stage: "envio", tone: "warn" },
  respondeu: { label: "Respondeu", stage: "conversa", tone: "good" },
  interessado: { label: "Interessado", stage: "conversa", tone: "good" },
  reuniao: { label: "Reuniao", stage: "conversa", tone: "good" },
  proposta: { label: "Proposta", stage: "conversa", tone: "good" },
  fechado: { label: "Fechado", stage: "ganho", tone: "good" },
  descartado: { label: "Descartado", stage: "saida", tone: "bad" },
  sem_interesse: { label: "Sem interesse", stage: "saida", tone: "bad" },
  perdido: { label: "Perdido", stage: "saida", tone: "bad" },
};

// Rotulos dos botoes de transicao (os mesmos da extensao — secao 6 do mapa).
// Quando ausente, usa STATUS_META[to].label.
const TRANSITION_LABELS: Record<string, string> = {
  "enviado->descartado": "Numero errado",
  "respondeu->reuniao": "Agendou reuniao",
  "qualificado->rascunho_pronto": "Gerar rascunho",
  "rascunho_pronto->aprovado": "Aprovar",
  "aprovado->enviado": "Marcar enviado",
  "sem_resposta->enviado": "Reenviar (follow-up)",
};

export function transitionLabel(from: LeadStatus, to: LeadStatus): string {
  return TRANSITION_LABELS[`${from}->${to}`] ?? STATUS_META[to].label;
}

// Ordem canonica do funil, para filtros e dashboard.
export const STATUS_ORDER: LeadStatus[] = [
  "bruto",
  "enriquecido",
  "qualificado",
  "rascunho_pronto",
  "aprovado",
  "enviado",
  "sem_resposta",
  "respondeu",
  "interessado",
  "reuniao",
  "proposta",
  "fechado",
  "perdido",
  "sem_interesse",
  "descartado",
];

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-transparent",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent",
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent",
  bad: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-transparent",
  accent: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-transparent",
};
