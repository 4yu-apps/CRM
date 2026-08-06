// #15/#16 — Carteira: quem e cliente, quanto entra por mes, e quem merece
// atencao antes de virar problema.
//
// As regras moram aqui, num lugar so, porque a mesma pergunta e feita em telas
// diferentes (Clientes, Resultados, Inicio) e respostas divergentes viram numero
// que ninguem confia.
import type { Lead } from "./types";
import { lastTouchAt, daysSinceTouch } from "./activities";

const DAY = 86_400_000;

// Dias sem toque pra uma conta ativa virar alerta. Mais curto que o limiar de
// prospeccao: cliente pagando esquecido e pior que lead esquecido.
export const SILENCIO_DIAS = 30;
// Antecedencia do aviso de renovacao/aniversario.
export const AVISO_DIAS = 30;

/** Cliente ativo: fechou e nao saiu. */
export function isClient(l: Lead): boolean {
  return l.status === "fechado" && !l.archived;
}

/** Cliente que saiu. Some da carteira ativa, nao some da historia. */
export function isChurned(l: Lead): boolean {
  return l.status === "cancelado";
}

/**
 * Quando a proxima data importante do contrato cai.
 *
 * `por_prazo` tem fim: fecha + N meses e acabou, ou renova.
 *
 * `mensal_fixo` nao tem fim, e por isso ficou CEGO desde sempre: a funcao
 * antiga so olhava por_prazo e devolvia null, entao metade da carteira nunca
 * gerava aviso nenhum. Aqui ele passa a marcar o ANIVERSARIO ANUAL.
 *
 * Anual, e nao mensal, de proposito. Aniversario mensal dispararia doze avisos
 * por ano por cliente, e alerta que toca sempre e alerta que ninguem le. O
 * momento que importa num contrato recorrente e o ano fechado: hora de olhar o
 * que foi entregue e revisar o valor.
 */
export function renewalDate(l: Lead): Date | null {
  if (l.status !== "fechado") return null;
  if (!l.deal_closed_at) return null;
  const base = new Date(l.deal_closed_at);
  if (Number.isNaN(base.getTime())) return null;

  if (l.deal_billing === "por_prazo") {
    if (!l.deal_term_months) return null;
    const d = new Date(base);
    d.setMonth(d.getMonth() + l.deal_term_months);
    return d;
  }

  if (l.deal_billing === "mensal_fixo") {
    // Proximo aniversario anual a partir de hoje.
    const d = new Date(base);
    d.setFullYear(d.getFullYear() + 1);
    while (d.getTime() < Date.now()) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  return null;
}

export function daysUntilRenewal(l: Lead): number | null {
  const r = renewalDate(l);
  if (!r) return null;
  return Math.ceil((r.getTime() - Date.now()) / DAY);
}

/** Quantos anos completos de casa. Só faz sentido pra recorrente. */
export function contractYears(l: Lead): number | null {
  if (l.deal_billing !== "mensal_fixo" || !l.deal_closed_at) return null;
  const base = new Date(l.deal_closed_at);
  if (Number.isNaN(base.getTime())) return null;
  const anos = Math.floor((Date.now() - base.getTime()) / (365.25 * DAY));
  return anos > 0 ? anos : null;
}

// ---------------------------------------------------------------------------
// Atencao: o que faz a tela de Clientes valer a visita
// ---------------------------------------------------------------------------
export type AttentionKind = "vencido" | "renovacao" | "aniversario" | "silencio" | "sem_valor";

export interface Attention {
  kind: AttentionKind;
  label: string;
  /** Ordena a lista: quanto menor, mais urgente. */
  rank: number;
}

/**
 * Por que essa conta merece atencao hoje, ou null se esta tudo bem.
 * Devolve UM motivo, o mais urgente: uma lista onde cada linha grita tres
 * coisas ao mesmo tempo nao e lista, e barulho.
 */
export function attentionOf(l: Lead, now = Date.now()): Attention | null {
  if (!isClient(l)) return null;

  const dias = daysUntilRenewal(l);
  const recorrente = l.deal_billing === "mensal_fixo";

  if (dias !== null && dias < 0) {
    return { kind: "vencido", label: `venceu há ${-dias}d`, rank: -1000 + dias };
  }
  if (dias !== null && dias <= AVISO_DIAS) {
    if (recorrente) {
      // "3 anos em 14d" = COMPLETA 3 anos daqui a 14 dias. O ordinal ("3º ano")
      // era ambiguo: da pra ler como "esta no terceiro" ou "completa tres".
      const n = (contractYears(l) ?? 0) + 1;
      return {
        kind: "aniversario",
        label: n === 1 ? `1 ano em ${dias}d` : `${n} anos em ${dias}d`,
        rank: dias,
      };
    }
    return { kind: "renovacao", label: dias === 0 ? "renova hoje" : `renova em ${dias}d`, rank: dias };
  }

  const semToque = daysSinceTouch(l, now);
  if (semToque >= SILENCIO_DIAS) {
    return { kind: "silencio", label: `sem toque há ${semToque}d`, rank: 100 - semToque };
  }

  // Cliente sem valor registrado nao entra no MRR: a carteira parece menor do
  // que e, e ninguem descobre isso olhando o total.
  if (l.deal_value == null) {
    return { kind: "sem_valor", label: "sem valor registrado", rank: 500 };
  }

  return null;
}

export function needsAttention(l: Lead, now = Date.now()): boolean {
  return attentionOf(l, now) !== null;
}

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

/** MRR contratado: soma dos mensais fixos ATIVOS. Quem cancelou sai da conta. */
export function mrr(leads: Lead[]): number {
  return leads
    .filter((l) => isClient(l) && l.deal_billing === "mensal_fixo")
    .reduce((s, l) => s + (l.deal_value ?? 0), 0);
}

/** MRR que saiu pela porta: o tamanho do buraco, nao so a contagem. */
export function churnedMrr(leads: Lead[]): number {
  return leads
    .filter((l) => isChurned(l) && l.deal_billing === "mensal_fixo")
    .reduce((s, l) => s + (l.deal_value ?? 0), 0);
}

/**
 * Taxa de churn no periodo: saidas / (ativos no fim + saidas).
 * Sem base nenhuma devolve 0, nao NaN.
 */
export function churnRate(leads: Lead[], desde: number): number {
  const saidas = leads.filter(
    (l) => isChurned(l) && l.churn_at != null && +new Date(l.churn_at) >= desde,
  ).length;
  const ativos = leads.filter(isClient).length;
  const base = ativos + saidas;
  return base > 0 ? saidas / base : 0;
}

// ---------------------------------------------------------------------------
// Frios reativaveis (prospeccao, nao carteira)
// ---------------------------------------------------------------------------
// Vive aqui por historia, mas a tela de Clientes deixou de mostrar: reaquecer
// lead que nunca fechou e trabalho de prospeccao, e misturar isso com carteira
// fazia a tela responder duas perguntas diferentes ao mesmo tempo.
const COLD_STATUSES = ["sem_resposta", "sem_interesse", "perdido"];

export function isColdReactivatable(l: Lead, minDays = 30): boolean {
  if (l.archived) return false;
  if (!COLD_STATUSES.includes(l.status)) return false;
  return Date.now() - +new Date(lastTouchAt(l)) >= minDays * DAY;
}

// Ha quanto tempo esse lead esta sem toque. Usa lastTouchAt (que cai em
// updated_at quando nao ha atividade registrada), senao o robo re-enriquecendo
// um lead perdido "esquentaria" ele sem ninguem ter falado com ninguem.
export function daysCold(l: Lead): number {
  return Math.floor((Date.now() - +new Date(lastTouchAt(l))) / DAY);
}
