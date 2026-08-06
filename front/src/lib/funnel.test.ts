import { describe, it, expect } from "vitest";
import { funnel, kpis, depth, pct, LADDER } from "./funnel";
import type { Lead, LeadStatus } from "./types";

// O funil e cumulativo: quem esta em 'reuniao' JA passou por 'enviado', entao
// conta nos dois. Errar isso faz a taxa de resposta parecer melhor ou pior do
// que e, e o dono decide onde gastar o dia olhando pra esse numero.

function leads(...statuses: LeadStatus[]): Lead[] {
  return statuses.map((status, i) => ({ id: `l${i}`, status }) as Lead);
}

describe("depth", () => {
  it("da a posicao na escada e -1 pra quem saiu dela", () => {
    expect(depth("bruto")).toBe(0);
    expect(depth("fechado")).toBe(LADDER.length - 1);
    expect(depth("descartado")).toBe(-1);
    expect(depth("sem_interesse")).toBe(-1);
    expect(depth("perdido")).toBe(-1);
  });

  it("sem_resposta fica fora da escada, senao contaria duas vezes", () => {
    // Ele e um desvio de 'enviado', nao um degrau proprio.
    expect(depth("sem_resposta")).toBe(-1);
  });
});

describe("funnel", () => {
  it("conta cumulativo: quem chegou longe conta nos degraus anteriores", () => {
    const f = funnel(leads("bruto", "enviado", "fechado"));
    const em = (s: LeadStatus) => f.find((x) => x.status === s)!.reached;
    expect(em("bruto")).toBe(3);
    expect(em("enviado")).toBe(2);
    expect(em("fechado")).toBe(1);
  });

  it("quem saiu do funil nao conta em degrau nenhum", () => {
    const f = funnel(leads("descartado", "perdido", "sem_interesse"));
    expect(f.every((x) => x.reached === 0)).toBe(true);
  });

  it("conversao e relativa ao degrau anterior, e null quando nao da pra dividir", () => {
    const f = funnel(leads("bruto", "bruto", "enviado", "enviado"));
    expect(f[0].conversion).toBeNull(); // topo nao tem anterior
    const enviado = f.find((x) => x.status === "enviado")!;
    expect(enviado.conversion).toBe(1); // os 2 que chegaram em enviado vieram dos 2 de aprovado
  });

  it("base vazia nao quebra nem inventa divisao por zero", () => {
    const f = funnel([]);
    expect(f.every((x) => x.reached === 0 && x.conversion === null)).toBe(true);
  });
});

describe("kpis", () => {
  it("taxa de resposta e de fechamento saem sobre os enviados", () => {
    const k = kpis(leads("enviado", "enviado", "respondeu", "fechado"));
    expect(k.enviados).toBe(4);
    expect(k.responderam).toBe(2); // respondeu + fechado
    expect(k.fechados).toBe(1);
    expect(k.taxaResposta).toBe(0.5);
    expect(k.taxaFechamento).toBe(0.25);
  });

  it("sem ninguem enviado, as taxas sao zero e nao NaN", () => {
    const k = kpis(leads("bruto", "qualificado"));
    expect(k.taxaResposta).toBe(0);
    expect(k.taxaFechamento).toBe(0);
    expect(Number.isNaN(k.taxaResposta)).toBe(false);
  });

  it("fechados conta so quem esta fechado agora, nao quem passou por la", () => {
    // fechado deixou de ser terminal (da pra reabrir). Quem voltou pro funil
    // nao pode continuar contando como receita ganha.
    const k = kpis(leads("fechado", "reuniao"));
    expect(k.fechados).toBe(1);
  });

  it("perdidos junta os tres jeitos de sair", () => {
    expect(kpis(leads("descartado", "sem_interesse", "perdido")).perdidos).toBe(3);
  });
});

describe("pct", () => {
  it("arredonda pro inteiro mais proximo", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.333)).toBe("33%");
    expect(pct(0)).toBe("0%");
    expect(pct(1)).toBe("100%");
  });
});
