// #Fatia5 — Recebimento: a diferenca entre combinado e entrou na conta.
//
// `deal_value` responde "quanto foi combinado". Ele nunca soube dizer se o
// dinheiro entrou, e o app fingia que sabia: um cliente de R$1.500 fechado em
// janeiro somava R$1.500 no MRR em agosto mesmo sem pagar desde marco.
//
// As duas perguntas continuam separadas, e e proposital:
//
//   contratado   soma de deal_value dos clientes ativos      (clients.ts, mrr)
//   recebido     soma dos lead_payments no periodo           (este arquivo)
//
// Nao sao a mesma coisa e nunca vao bater. Contratado e promessa, recebido e
// fato. Um CRM que mostra so o primeiro parece maior do que e.
//
// Quem esta DEVENDO nao mora aqui, mora em clients.ts: isso e pergunta de
// carteira ("essa conta merece minha atencao hoje?"), e fica junto das outras
// pra que a tela de Clientes continue tendo uma fonte so de alerta.
import type { Lead, LeadPayment } from "./types";
import { addMonths, parseDateOnly, toDateOnly } from "./format";

/**
 * Ate quando o PROXIMO recebimento deve cobrir.
 *
 * Parte de onde a cobertura parou; sem cobertura nenhuma, parte do fechamento
 * do negocio, que e o unico marco confiavel de quando o contrato comecou a
 * valer. Sem nenhum dos dois, parte de hoje: melhor propor uma data plausivel
 * do que travar o registro.
 */
export function nextCoverUntil(l: Lead, now = Date.now()): string {
  const base =
    parseDateOnly(l.paid_until) ?? parseDateOnly(l.deal_closed_at?.slice(0, 10)) ?? new Date(now);
  return toDateOnly(addMonths(base, 1));
}

/**
 * Quanto se espera por mes desse cliente. Vale pros dois tipos de cobranca:
 * `por_prazo` tambem e mensal, so que com fim marcado (o total contratado e
 * valor x meses, como Resultados ja mostra).
 */
export function expectedMonthly(l: Lead): number | null {
  return l.deal_value ?? null;
}

/**
 * Soma dos recebimentos numa janela [from, to). Sem janela, soma tudo.
 *
 * Soma o `amount` guardado em cada linha em vez de reconstruir a partir do
 * deal_value de hoje. Reconstrucao mente no dia em que o preco muda, e preco de
 * agencia muda.
 */
export function received(payments: LeadPayment[], from?: Date | null, to?: Date | null): number {
  return payments.reduce((s, p) => {
    if (from || to) {
      const d = parseDateOnly(p.paid_on);
      if (!d) return s;
      if (from && d.getTime() < from.getTime()) return s;
      if (to && d.getTime() >= to.getTime()) return s;
    }
    return s + p.amount;
  }, 0);
}

/** Recebimentos de um lead so, mais recentes primeiro. */
export function paymentsOf(payments: LeadPayment[], leadId: string): LeadPayment[] {
  return payments
    .filter((p) => p.lead_id === leadId)
    .sort((a, b) => (a.paid_on < b.paid_on ? 1 : a.paid_on > b.paid_on ? -1 : 0));
}

/**
 * Quanto cada cliente ja pagou, indexado por lead_id. Uma passada so: as telas
 * de carteira carregam a base inteira em memoria, e um `filter` por linha
 * dentro do render sairia O(n x m).
 */
export function receivedByLead(payments: LeadPayment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of payments) m.set(p.lead_id, (m.get(p.lead_id) ?? 0) + p.amount);
  return m;
}
