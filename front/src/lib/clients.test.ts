import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isClient, isChurned, renewalDate, daysUntilRenewal, contractYears,
  attentionOf, needsAttention, mrr, churnedMrr, churnRate,
  isColdReactivatable, daysCold, SILENCIO_DIAS,
  tracksPayments, daysOverdue, isOverdue, overdueAmount, TOLERANCIA_DIAS,
} from "./clients";
import type { Lead } from "./types";

// Estas funcoes decidem o que a tela Clientes chama de cliente, quanto de MRR
// soma e quem ela cobra atencao. Erro aqui nao aparece como bug: aparece como um
// numero errado que o dono usa pra tomar decisao.

const HOJE = new Date("2026-08-06T12:00:00-03:00");
const diasAtras = (n: number) => new Date(HOJE.getTime() - n * 86_400_000).toISOString();

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1", owner_id: "o1", status: "fechado", business_name: "Doceria da Ana",
    cnpj: null, phone: null, email: null, instagram: null, website: null,
    maps_place_id: null, maps_url: null, rating: null, reviews_count: null,
    category: null, address: null, neighborhood: null, city: null, state: null,
    owner_name: null, score: null, score_reason: null, service_target: "indefinido",
    opt_out: false, opt_out_at: null, archived: false,
    deal_value: 1500, deal_billing: "mensal_fixo", deal_closed_at: diasAtras(10),
    last_activity_at: diasAtras(1),
    created_at: HOJE.toISOString(), updated_at: HOJE.toISOString(),
    ...over,
  } as Lead;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => vi.useRealTimers());

describe("quem e cliente", () => {
  it("cliente ativo e lead fechado e nao arquivado", () => {
    expect(isClient(lead())).toBe(true);
    expect(isClient(lead({ archived: true }))).toBe(false);
    expect(isClient(lead({ status: "reuniao" }))).toBe(false);
  });

  it("quem cancelou sai da carteira ativa, mas continua identificavel", () => {
    const saiu = lead({ status: "cancelado" });
    expect(isClient(saiu)).toBe(false);
    expect(isChurned(saiu)).toBe(true);
  });

  it("perdido nao e cancelado: um nunca fechou, o outro fechou e foi embora", () => {
    expect(isChurned(lead({ status: "perdido" }))).toBe(false);
  });
});

describe("renovacao", () => {
  it("contrato por prazo vence N meses depois do fechamento", () => {
    const l = lead({
      deal_billing: "por_prazo", deal_term_months: 6,
      deal_closed_at: "2026-03-06T12:00:00-03:00",
    });
    expect(renewalDate(l)?.getMonth()).toBe(8); // setembro
    expect(daysUntilRenewal(l)).toBe(31);
  });

  it("vencido vem negativo, pra tela poder gritar", () => {
    const l = lead({
      deal_billing: "por_prazo", deal_term_months: 1,
      deal_closed_at: "2026-06-06T12:00:00-03:00",
    });
    expect(daysUntilRenewal(l)!).toBeLessThan(0);
  });

  it("contrato mensal DEIXOU de ser cego: marca o aniversario anual", () => {
    // Era o buraco #7 do plano: renewalDate so olhava por_prazo, entao metade da
    // carteira nunca gerava aviso nenhum. Agora marca 1 ano de casa.
    const l = lead({ deal_billing: "mensal_fixo", deal_closed_at: "2025-08-20T12:00:00-03:00" });
    const r = renewalDate(l);
    expect(r).not.toBeNull();
    expect(r!.getFullYear()).toBe(2026);
    expect(r!.getMonth()).toBe(7); // agosto
  });

  it("aniversario anual PULA pra frente em contrato velho, nao fica no passado", () => {
    // Cliente de 3 anos: o aviso tem que ser o proximo aniversario, nao o de
    // 2024, senao a tela mostraria "venceu ha 700 dias" pra quem esta em dia.
    const l = lead({ deal_billing: "mensal_fixo", deal_closed_at: "2023-03-10T12:00:00-03:00" });
    const dias = daysUntilRenewal(l)!;
    expect(dias).toBeGreaterThan(0);
    expect(renewalDate(l)!.getFullYear()).toBe(2027);
  });

  it("contrato fechado em dia 31 nao transborda pro mes seguinte", () => {
    // Era um bug real: `setMonth(+1)` num 31 de janeiro devolve 3 de marco,
    // porque o JS aceita "31 de fevereiro" e desliza. O aviso de renovacao
    // chegava tres dias depois do dia que ele existe pra nao deixar passar.
    const l = lead({
      deal_billing: "por_prazo", deal_term_months: 1,
      deal_closed_at: "2026-01-31T12:00:00-03:00",
    });
    const r = renewalDate(l)!;
    expect(r.getMonth()).toBe(1); // fevereiro, nao marco
    expect(r.getDate()).toBe(28);
  });

  it("sem data, sem prazo ou fora da carteira nao ha renovacao", () => {
    expect(renewalDate(lead({ deal_closed_at: null }))).toBeNull();
    expect(renewalDate(lead({ deal_billing: "por_prazo", deal_term_months: null }))).toBeNull();
    expect(renewalDate(lead({ status: "cancelado" }))).toBeNull();
    expect(renewalDate(lead({ deal_closed_at: "banana" }))).toBeNull();
  });

  it("contractYears conta anos completos so pra recorrente", () => {
    expect(contractYears(lead({ deal_closed_at: "2023-08-06T12:00:00-03:00" }))).toBe(3);
    expect(contractYears(lead({ deal_closed_at: diasAtras(10) }))).toBeNull();
    expect(contractYears(lead({ deal_billing: "por_prazo" }))).toBeNull();
  });
});

describe("pagamento em atraso", () => {
  it("sem recebimento nenhum registrado, o cliente NAO esta em atraso", () => {
    // A distincao que impede um alarme falso em massa: paid_until vazio quer
    // dizer "ninguem acompanha", nao "nao pagou". No dia em que a coluna
    // nasceu, a carteira inteira estava assim.
    const l = lead({ paid_until: null });
    expect(tracksPayments(l)).toBe(false);
    expect(daysOverdue(l)).toBeNull();
    expect(isOverdue(l)).toBe(false);
  });

  it("cobertura no futuro e cliente em dia, com dias negativos", () => {
    const l = lead({ paid_until: "2026-09-06" });
    expect(daysOverdue(l)!).toBeLessThan(0);
    expect(isOverdue(l)).toBe(false);
  });

  it("a tolerancia segura o alarme nos primeiros dias", () => {
    // Boleto compensa em um ou dois dias. Gritar no dia seguinte ao vencimento
    // faria o alerta acordar todo comeco de mes sem nada ter acontecido.
    const dentro = lead({ paid_until: "2026-08-03" }); // 3 dias
    const fora = lead({ paid_until: "2026-08-02" }); // 4 dias
    expect(daysOverdue(dentro)).toBe(TOLERANCIA_DIAS);
    expect(isOverdue(dentro)).toBe(false);
    expect(isOverdue(fora)).toBe(true);
  });

  it("quem nao e cliente ativo nao entra na conta de atraso", () => {
    // Cliente que saiu da carteira e cobranca, nao gestao. Se ele contasse
    // aqui, todo churn viraria um alerta permanente que ninguem pode resolver.
    expect(daysOverdue(lead({ status: "cancelado", paid_until: "2026-01-01" }))).toBeNull();
    expect(daysOverdue(lead({ archived: true, paid_until: "2026-01-01" }))).toBeNull();
  });

  it("o total em atraso soma um mes de cada devedor, nao o acumulado", () => {
    // O CRM sabe ate quando o ultimo recebimento cobriu, nao quantos meses
    // ficaram pra tras. Multiplicar por meses estimados seria chute com cara
    // de numero.
    const base = [
      lead({ id: "a", deal_value: 1000, paid_until: "2026-05-01" }), // meses atras
      lead({ id: "b", deal_value: 500, paid_until: "2026-07-01" }),
      lead({ id: "c", deal_value: 800, paid_until: "2026-09-01" }), // em dia
      lead({ id: "d", deal_value: 700, paid_until: null }), // nao acompanhado
    ];
    expect(overdueAmount(base)).toBe(1500);
  });
});

describe("atencao", () => {
  it("atraso vem antes de tudo, ate de contrato vencido", () => {
    // Contrato que vence e problema do mes que vem. Cliente que parou de pagar
    // ja e problema deste mes, e adiar so aumenta o valor da conversa.
    const l = lead({
      paid_until: "2026-06-01",
      deal_billing: "por_prazo", deal_term_months: 1,
      deal_closed_at: "2026-01-06T12:00:00-03:00", // tambem vencido
      last_activity_at: diasAtras(200), // tambem em silencio
    });
    const a = attentionOf(l)!;
    expect(a.kind).toBe("atraso");
    expect(a.label).toContain("sem pagar");
  });

  it("quanto mais atrasado, mais no topo da lista", () => {
    const pouco = attentionOf(lead({ paid_until: "2026-07-25" }))!;
    const muito = attentionOf(lead({ paid_until: "2026-03-01" }))!;
    expect(muito.rank).toBeLessThan(pouco.rank);
  });

  it("cliente em dia com o pagamento cai nas outras regras, nao no atraso", () => {
    const l = lead({ paid_until: "2026-09-06", last_activity_at: diasAtras(45) });
    expect(attentionOf(l)!.kind).toBe("silencio");
  });

  it("vencido vem antes de tudo", () => {
    const l = lead({
      deal_billing: "por_prazo", deal_term_months: 1,
      deal_closed_at: "2026-01-06T12:00:00-03:00",
      last_activity_at: diasAtras(200), // tambem esta em silencio
    });
    expect(attentionOf(l)!.kind).toBe("vencido");
  });

  it("renovacao proxima aparece dentro da janela de aviso", () => {
    const l = lead({
      deal_billing: "por_prazo", deal_term_months: 6,
      deal_closed_at: "2026-02-20T12:00:00-03:00",
    });
    expect(attentionOf(l)!.kind).toBe("renovacao");
  });

  it("aniversario de recorrente vira aviso proprio, com o ano na etiqueta", () => {
    // A etiqueta conta o que ele COMPLETA, nao em que ano esta: "3 anos em 14d".
    const primeiro = lead({ deal_billing: "mensal_fixo", deal_closed_at: "2025-08-20T12:00:00-03:00" });
    const a = attentionOf(primeiro)!;
    expect(a.kind).toBe("aniversario");
    expect(a.label).toBe("1 ano em 14d");

    const veterano = lead({ deal_billing: "mensal_fixo", deal_closed_at: "2023-08-20T12:00:00-03:00" });
    expect(attentionOf(veterano)!.label).toBe("3 anos em 14d");
  });

  it("silencio prolongado vira alerta, e conta os dias de verdade", () => {
    const l = lead({ last_activity_at: diasAtras(45) });
    const a = attentionOf(l)!;
    expect(a.kind).toBe("silencio");
    expect(a.label).toContain("45");
  });

  it("cliente sem valor registrado e cobrado, senao some do MRR calado", () => {
    expect(attentionOf(lead({ deal_value: null }))!.kind).toBe("sem_valor");
  });

  it("cliente em dia nao aparece na lista de atencao", () => {
    expect(attentionOf(lead())).toBeNull();
    expect(needsAttention(lead())).toBe(false);
  });

  it("quem nao e cliente ativo nunca pede atencao aqui", () => {
    expect(attentionOf(lead({ status: "cancelado" }))).toBeNull();
    expect(attentionOf(lead({ status: "reuniao" }))).toBeNull();
  });

  it("o silencio comeca exatamente no limiar, nao um dia depois", () => {
    expect(attentionOf(lead({ last_activity_at: diasAtras(SILENCIO_DIAS) }))!.kind).toBe("silencio");
    expect(attentionOf(lead({ last_activity_at: diasAtras(SILENCIO_DIAS - 1) }))).toBeNull();
  });
});

describe("dinheiro", () => {
  it("MRR soma so os mensais fixos ativos", () => {
    const base = [
      lead({ id: "a", deal_value: 1000 }),
      lead({ id: "b", deal_value: 500 }),
      lead({ id: "c", deal_value: 9999, deal_billing: "por_prazo", deal_term_months: 6 }),
    ];
    expect(mrr(base)).toBe(1500);
  });

  it("quem cancelou PARA de contar no MRR", () => {
    // O bug que a Fatia 3 veio matar: o numero so subia, porque somava todo
    // mensal fixo ja fechado, pra sempre.
    const base = [lead({ id: "a", deal_value: 1000 }), lead({ id: "b", deal_value: 500, status: "cancelado" })];
    expect(mrr(base)).toBe(1000);
    expect(churnedMrr(base)).toBe(500);
  });

  it("arquivado tambem sai do MRR", () => {
    expect(mrr([lead({ deal_value: 800, archived: true })])).toBe(0);
  });

  it("taxa de churn olha so as saidas do periodo", () => {
    const base = [
      lead({ id: "a" }),
      lead({ id: "b" }),
      lead({ id: "c", status: "cancelado", churn_at: diasAtras(5) }),
      lead({ id: "d", status: "cancelado", churn_at: diasAtras(400) }), // fora do periodo
    ];
    const desde = HOJE.getTime() - 90 * 86_400_000;
    expect(churnRate(base, desde)).toBeCloseTo(1 / 3, 5);
  });

  it("sem cliente nenhum a taxa e 0, nao NaN", () => {
    expect(churnRate([], HOJE.getTime() - 86_400_000)).toBe(0);
    expect(Number.isNaN(churnRate([], 0))).toBe(false);
  });
});

describe("frios reativaveis", () => {
  const frio = (dias: number, status: Lead["status"]) =>
    lead({ status, last_activity_at: diasAtras(dias) });

  it("pega quem saiu do funil ha 30 dias ou mais", () => {
    expect(isColdReactivatable(frio(31, "sem_resposta"))).toBe(true);
    expect(isColdReactivatable(frio(90, "perdido"))).toBe(true);
  });

  it("cliente e cancelado nunca entram em reativacao de frio", () => {
    expect(isColdReactivatable(frio(365, "fechado"))).toBe(false);
    // Cliente que saiu e reconquista de carteira, nao lead frio pra prospectar.
    expect(isColdReactivatable(frio(365, "cancelado"))).toBe(false);
  });

  it("o robo re-enriquecer NAO esquenta um lead abandonado", () => {
    const l = lead({
      status: "perdido",
      updated_at: diasAtras(1),
      last_activity_at: diasAtras(60),
    });
    expect(daysCold(l)).toBe(60);
    expect(isColdReactivatable(l)).toBe(true);
  });
});
