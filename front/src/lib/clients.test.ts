import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isClient, renewalDate, daysUntilRenewal, isColdReactivatable, daysCold } from "./clients";
import type { Lead } from "./types";

// Estas funcoes decidem o que a tela Clientes chama de cliente, quanto de MRR ela
// soma e quando ela grita "renova em X dias". Erro aqui nao aparece como bug:
// aparece como um numero errado que o dono usa pra tomar decisao.

const HOJE = new Date("2026-08-06T12:00:00-03:00");

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    owner_id: "o1",
    status: "fechado",
    business_name: "Doceria da Ana",
    cnpj: null, phone: null, email: null, instagram: null, website: null,
    maps_place_id: null, maps_url: null, rating: null, reviews_count: null,
    category: null, address: null, neighborhood: null, city: null, state: null,
    owner_name: null, score: null, score_reason: null, service_target: "indefinido",
    opt_out: false, opt_out_at: null, archived: false,
    created_at: HOJE.toISOString(), updated_at: HOJE.toISOString(),
    ...over,
  } as Lead;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(HOJE);
});
afterEach(() => vi.useRealTimers());

describe("quem conta como cliente", () => {
  it("cliente e lead fechado e nao arquivado", () => {
    expect(isClient(lead())).toBe(true);
    expect(isClient(lead({ archived: true }))).toBe(false);
    expect(isClient(lead({ status: "reuniao" }))).toBe(false);
  });
});

describe("renovacao", () => {
  it("contrato por prazo renova N meses depois do fechamento", () => {
    const l = lead({
      deal_billing: "por_prazo",
      deal_term_months: 6,
      deal_closed_at: "2026-03-06T12:00:00-03:00",
    });
    expect(renewalDate(l)?.getMonth()).toBe(8); // setembro (0-based)
    expect(daysUntilRenewal(l)).toBe(31);
  });

  it("renovacao vencida vem negativa, pra tela poder gritar", () => {
    const l = lead({
      deal_billing: "por_prazo",
      deal_term_months: 1,
      deal_closed_at: "2026-06-06T12:00:00-03:00",
    });
    expect(daysUntilRenewal(l)!).toBeLessThan(0);
  });

  it("sem prazo, sem data ou sem ser cliente nao ha renovacao", () => {
    expect(renewalDate(lead({ deal_billing: "por_prazo", deal_term_months: 6 }))).toBeNull();
    expect(renewalDate(lead({ deal_billing: "por_prazo", deal_closed_at: "2026-03-06" }))).toBeNull();
    expect(renewalDate(lead({ status: "reuniao", deal_billing: "por_prazo", deal_term_months: 6, deal_closed_at: "2026-03-06" }))).toBeNull();
  });

  it("data de fechamento invalida nao vira Invalid Date na tela", () => {
    const l = lead({ deal_billing: "por_prazo", deal_term_months: 6, deal_closed_at: "banana" });
    expect(renewalDate(l)).toBeNull();
  });

  it("BURACO CONHECIDO: contrato mensal nunca gera alerta", () => {
    // Metade da carteira e mensal fixo, e hoje ela e cega: renewalDate so olha
    // 'por_prazo'. Esta prevista pra Fatia 3 (aniversario mensal do contrato).
    // O teste existe pra registrar o comportamento atual, nao pra abenco-lo:
    // quando a Fatia 3 entrar, este teste MUDA de lado.
    const l = lead({ deal_billing: "mensal_fixo", deal_value: 1500, deal_closed_at: "2025-08-06T12:00:00-03:00" });
    expect(renewalDate(l)).toBeNull();
    expect(daysUntilRenewal(l)).toBeNull();
  });
});

describe("frios reativaveis", () => {
  const frio = (dias: number, status: Lead["status"]) =>
    lead({ status, updated_at: new Date(HOJE.getTime() - dias * 86_400_000).toISOString() });

  it("pega quem saiu do funil ha 30 dias ou mais", () => {
    expect(isColdReactivatable(frio(31, "sem_resposta"))).toBe(true);
    expect(isColdReactivatable(frio(40, "sem_interesse"))).toBe(true);
    expect(isColdReactivatable(frio(90, "perdido"))).toBe(true);
  });

  it("nao pega quem esfriou ontem, nem quem esta ativo, nem arquivado", () => {
    expect(isColdReactivatable(frio(2, "sem_resposta"))).toBe(false);
    expect(isColdReactivatable(frio(90, "reuniao"))).toBe(false);
    expect(isColdReactivatable({ ...frio(90, "perdido"), archived: true })).toBe(false);
  });

  it("cliente fechado nunca entra em reativacao de frio", () => {
    expect(isColdReactivatable(frio(365, "fechado"))).toBe(false);
  });

  it("daysCold conta o tempo desde o ultimo toque", () => {
    expect(daysCold(frio(45, "perdido"))).toBe(45);
  });

  it("o robo re-enriquecer NAO esquenta um lead abandonado", () => {
    // updated_at de ontem porque a esteira reprocessou, mas o ultimo toque de
    // verdade foi ha 60 dias. Antes da linha do tempo isso sumia da reativacao
    // sozinho, e a receita parada no banco continuava parada.
    const l = lead({
      status: "perdido",
      updated_at: new Date(HOJE.getTime() - 1 * 86_400_000).toISOString(),
      last_activity_at: new Date(HOJE.getTime() - 60 * 86_400_000).toISOString(),
    });
    expect(daysCold(l)).toBe(60);
    expect(isColdReactivatable(l)).toBe(true);
  });

  it("toque recente tira o lead da reativacao, mesmo com updated_at antigo", () => {
    const l = lead({
      status: "sem_resposta",
      updated_at: new Date(HOJE.getTime() - 90 * 86_400_000).toISOString(),
      last_activity_at: new Date(HOJE.getTime() - 2 * 86_400_000).toISOString(),
    });
    expect(isColdReactivatable(l)).toBe(false);
  });
});
