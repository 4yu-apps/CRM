// #15/#16 — Pos-venda derivado dos campos que ja existem (sem schema novo).
// Cliente = lead fechado. Renovacao = deal_closed_at + deal_term_months (so
// faz sentido p/ contrato "por_prazo"; "mensal_fixo" e recorrente, sem fim).
import type { Lead } from "./types";

const DAY = 86_400_000;

export function isClient(l: Lead): boolean {
  return l.status === "fechado" && !l.archived;
}

export function renewalDate(l: Lead): Date | null {
  if (l.status !== "fechado") return null;
  if (l.deal_billing !== "por_prazo") return null;
  if (!l.deal_closed_at || !l.deal_term_months) return null;
  const base = new Date(l.deal_closed_at);
  if (Number.isNaN(base.getTime())) return null;
  const d = new Date(base);
  d.setMonth(d.getMonth() + l.deal_term_months);
  return d;
}

export function daysUntilRenewal(l: Lead): number | null {
  const r = renewalDate(l);
  if (!r) return null;
  return Math.ceil((r.getTime() - Date.now()) / DAY);
}

// Frios reativaveis: sairam do funil (sem resposta longa / sem interesse /
// perdido) ha minDays+ dias. Sao receita barata parada no banco.
const COLD_STATUSES = ["sem_resposta", "sem_interesse", "perdido"];

export function isColdReactivatable(l: Lead, minDays = 30): boolean {
  if (l.archived) return false;
  if (!COLD_STATUSES.includes(l.status)) return false;
  return Date.now() - +new Date(l.updated_at) >= minDays * DAY;
}

export function daysCold(l: Lead): number {
  return Math.floor((Date.now() - +new Date(l.updated_at)) / DAY);
}
