// #15/#16 — Carteira: quem e cliente, quanto entra por mes, e quem merece
// atencao antes de virar problema.
//
// As regras moram aqui, num lugar so, porque a mesma pergunta e feita em telas
// diferentes (Clientes, Resultados, Inicio) e respostas divergentes viram numero
// que ninguem confia.
import type { Lead } from "./types";
import { lastTouchAt, daysSinceTouch } from "./activities";
import { addMonths, parseDateOnly } from "./format";

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

  // addMonths em vez de setMonth cru: um contrato fechado em 31 de janeiro com
  // prazo de um mes "renovava" em 3 de marco, porque o JS aceita 31 de fevereiro
  // e desliza pro mes seguinte. Tres dias de silencio num aviso que existe
  // justamente pra nao deixar passar a data.
  if (l.deal_billing === "por_prazo") {
    if (!l.deal_term_months) return null;
    return addMonths(base, l.deal_term_months);
  }

  if (l.deal_billing === "mensal_fixo") {
    // Proximo aniversario anual a partir de hoje.
    let d = addMonths(base, 12);
    while (d.getTime() < Date.now()) d = addMonths(d, 12);
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
// Pagamento em atraso
// ---------------------------------------------------------------------------
// Mora aqui, e nao em payments.ts, porque "essa conta merece minha atencao
// hoje?" e pergunta de carteira. payments.ts cuida do dinheiro que entrou.

/** Dias de tolerancia antes de um atraso virar alerta. */
// Pix cai no dia, boleto compensa em um ou dois. Gritar no dia seguinte ao
// vencimento faz o alerta acordar todo comeco de mes sem nada ter acontecido.
export const TOLERANCIA_DIAS = 3;

/**
 * Alguem esta acompanhando recebimento desse cliente?
 *
 * `paid_until` vazio NAO quer dizer caloteiro: quer dizer que nunca se
 * registrou recebimento nenhum. Tratar as duas coisas igual poria a carteira
 * inteira em atraso no dia em que a coluna nasceu, que e o mesmo erro que a
 * Fatia 2 evitou com o `last_activity_at`. Silencio ate o primeiro registro.
 */
export function tracksPayments(l: Lead): boolean {
  return !!l.paid_until;
}

/**
 * Dias de atraso. Negativo = ainda faltam dias pra vencer.
 * Null quando a pergunta nao se aplica: nao e cliente, ou ninguem acompanha.
 */
export function daysOverdue(l: Lead, now = Date.now()): number | null {
  if (!isClient(l)) return null;
  const ate = parseDateOnly(l.paid_until);
  if (!ate) return null;
  return Math.floor((now - ate.getTime()) / DAY);
}

/** Esta devendo, ja passada a tolerancia. */
export function isOverdue(l: Lead, now = Date.now()): boolean {
  const d = daysOverdue(l, now);
  return d !== null && d > TOLERANCIA_DIAS;
}

/** Soma do que esta em atraso agora: um mes de cada cliente que passou do prazo.
 *  Um mes, e nao o acumulado: o CRM nao sabe quantos meses ficaram pra tras, so
 *  ate quando o ultimo recebimento cobriu. Inventar o resto seria chute. */
export function overdueAmount(leads: Lead[], now = Date.now()): number {
  return leads.filter((l) => isOverdue(l, now)).reduce((s, l) => s + (l.deal_value ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Atencao: o que faz a tela de Clientes valer a visita
// ---------------------------------------------------------------------------
export type AttentionKind =
  | "atraso"
  | "vencido"
  | "renovacao"
  | "aniversario"
  | "silencio"
  | "sem_valor";

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

  // Dinheiro que nao entrou vem antes de tudo. Contrato que vence e problema do
  // mes que vem; cliente que parou de pagar ja e problema deste mes, e adiar a
  // conversa so aumenta o valor da conversa.
  const atraso = daysOverdue(l, now);
  if (atraso !== null && atraso > TOLERANCIA_DIAS) {
    return { kind: "atraso", label: `${atraso}d sem pagar`, rank: -2000 - atraso };
  }

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
