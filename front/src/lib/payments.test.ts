import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextCoverUntil, expectedMonthly, received, paymentsOf, receivedByLead } from "./payments";
import { addMonths, parseDateOnly, toDateOnly } from "./format";
import type { Lead, LeadPayment } from "./types";

// Estas funcoes decidem o numero que o dono le como "entrou dinheiro". Errar
// aqui nao aparece como bug na tela: aparece como um mes que parece melhor do
// que foi.

const HOJE = new Date("2026-08-06T12:00:00-03:00");

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1", owner_id: "o1", status: "fechado", business_name: "Doceria da Ana",
    cnpj: null, phone: null, email: null, instagram: null, website: null,
    maps_place_id: null, maps_url: null, rating: null, reviews_count: null,
    category: null, address: null, neighborhood: null, city: null, state: null,
    owner_name: null, score: null, score_reason: null, service_target: "indefinido",
    opt_out: false, opt_out_at: null, archived: false,
    deal_value: 1500, deal_billing: "mensal_fixo",
    deal_closed_at: "2026-01-10T12:00:00-03:00",
    created_at: HOJE.toISOString(), updated_at: HOJE.toISOString(),
    ...over,
  } as Lead;
}

function pay(over: Partial<LeadPayment> = {}): LeadPayment {
  return {
    id: "p1", lead_id: "l1", amount: 1500, paid_on: "2026-08-05",
    covers_until: "2026-09-05", note: null, created_at: HOJE.toISOString(),
    ...over,
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => vi.useRealTimers());

describe("soma de meses sem transbordar", () => {
  it("31 de janeiro mais um mes e 28 de fevereiro, nao 3 de marco", () => {
    // O JS aceita "31 de fevereiro" e desliza pro mes seguinte. Num contrato
    // isso vira um aviso de renovacao tres dias atrasado.
    expect(toDateOnly(addMonths(new Date(2026, 0, 31, 12), 1))).toBe("2026-02-28");
  });

  it("em ano bissexto o fim de fevereiro e 29", () => {
    expect(toDateOnly(addMonths(new Date(2024, 0, 31, 12), 1))).toBe("2024-02-29");
  });

  it("31 de marco mais um mes e 30 de abril", () => {
    expect(toDateOnly(addMonths(new Date(2026, 2, 31, 12), 1))).toBe("2026-04-30");
  });

  it("dia que existe nos dois meses nao muda", () => {
    expect(toDateOnly(addMonths(new Date(2026, 0, 10, 12), 1))).toBe("2026-02-10");
  });

  it("virada de ano funciona", () => {
    expect(toDateOnly(addMonths(new Date(2026, 11, 15, 12), 1))).toBe("2027-01-15");
  });
});

describe("data de coluna `date` nao escorrega de dia", () => {
  it("le YYYY-MM-DD no fuso local, nao em UTC", () => {
    // `new Date("2026-08-06")` e meia-noite UTC, que no Brasil e dia 5 as 21h.
    // O CRM inteiro mostraria a vespera.
    const d = parseDateOnly("2026-08-06")!;
    expect(d.getDate()).toBe(6);
    expect(d.getMonth()).toBe(7);
  });

  it("vazio e lixo devolvem null em vez de Invalid Date", () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly("nao e data")).toBeNull();
  });
});

describe("ate quando o proximo recebimento cobre", () => {
  it("continua de onde a cobertura parou", () => {
    expect(nextCoverUntil(lead({ paid_until: "2026-07-10" }))).toBe("2026-08-10");
  });

  it("sem cobertura nenhuma, parte do fechamento do negocio", () => {
    // E o unico marco confiavel de quando o contrato comecou a valer. Partir de
    // hoje faria o primeiro mes cobrado comecar meses depois do combinado.
    expect(nextCoverUntil(lead({ paid_until: null }))).toBe("2026-02-10");
  });

  it("sem fechamento nem cobertura, parte de hoje em vez de travar", () => {
    expect(nextCoverUntil(lead({ paid_until: null, deal_closed_at: null }))).toBe("2026-09-06");
  });

  it("nao transborda quando a cobertura termina em dia 31", () => {
    expect(nextCoverUntil(lead({ paid_until: "2026-01-31" }))).toBe("2026-02-28");
  });
});

describe("quanto se espera por mes", () => {
  it("por_prazo tambem e mensal: o prazo so marca o fim", () => {
    // Resultados ja trata assim ao mostrar "valor x meses" como total
    // contratado. Se aqui divergisse, os dois numeros brigariam.
    expect(expectedMonthly(lead({ deal_billing: "por_prazo", deal_term_months: 6 }))).toBe(1500);
  });

  it("sem valor combinado nao inventa um", () => {
    expect(expectedMonthly(lead({ deal_value: null }))).toBeNull();
  });
});

describe("quanto entrou", () => {
  const lista = [
    pay({ id: "a", amount: 1500, paid_on: "2026-08-05" }),
    pay({ id: "b", amount: 900, paid_on: "2026-07-31" }),
    pay({ id: "c", amount: 300, paid_on: "2026-06-01" }),
  ];

  it("sem janela soma tudo", () => {
    expect(received(lista)).toBe(2700);
  });

  it("a janela e fechada no comeco e aberta no fim", () => {
    // [from, to). O dia 31/07 entra em julho e NAO entra em agosto; sem isso o
    // mesmo recebimento apareceria nos dois meses.
    const julho = received(lista, new Date(2026, 6, 1, 0), new Date(2026, 7, 1, 0));
    const agosto = received(lista, new Date(2026, 7, 1, 0), new Date(2026, 8, 1, 0));
    expect(julho).toBe(900);
    expect(agosto).toBe(1500);
  });

  it("soma o valor gravado, nao o preco de hoje", () => {
    // O cliente pagava 900 e passou a pagar 1500. Reconstruir o historico pelo
    // preco atual inflaria o passado.
    expect(received([pay({ amount: 900 }), pay({ id: "x", amount: 1500 })])).toBe(2400);
  });

  it("lista vazia e zero, nao NaN", () => {
    expect(received([])).toBe(0);
  });
});

describe("recebimentos por cliente", () => {
  it("filtra pelo lead e ordena do mais recente pro mais antigo", () => {
    const r = paymentsOf(
      [
        pay({ id: "a", lead_id: "l1", paid_on: "2026-06-01" }),
        pay({ id: "b", lead_id: "l2", paid_on: "2026-08-01" }),
        pay({ id: "c", lead_id: "l1", paid_on: "2026-08-05" }),
      ],
      "l1",
    );
    expect(r.map((p) => p.id)).toEqual(["c", "a"]);
  });

  it("total por cliente sai numa passada so", () => {
    const m = receivedByLead([
      pay({ id: "a", lead_id: "l1", amount: 1500 }),
      pay({ id: "b", lead_id: "l1", amount: 500 }),
      pay({ id: "c", lead_id: "l2", amount: 300 }),
    ]);
    expect(m.get("l1")).toBe(2000);
    expect(m.get("l2")).toBe(300);
    expect(m.get("nao-existe")).toBeUndefined();
  });
});
