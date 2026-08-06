import { describe, it, expect } from "vitest";
import { parseBRL, toDateInput, fromDateInput, todayInput, fmtPhone, fmtCnpj } from "./format";

describe("parseBRL", () => {
  it("le dinheiro do jeito que o brasileiro digita", () => {
    expect(parseBRL("2500")).toBe(2500);
    expect(parseBRL("2.500")).toBe(2500);
    expect(parseBRL("2.500,00")).toBe(2500);
    expect(parseBRL("R$ 2.500,00")).toBe(2500);
    expect(parseBRL("1500,50")).toBe(1500.5);
    expect(parseBRL("1.234.567")).toBe(1234567);
    expect(parseBRL("1.234.567,89")).toBe(1234567.89);
    expect(parseBRL("  1200  ")).toBe(1200);
  });

  it("desempata o ponto sozinho por quantidade de casas", () => {
    // Pra gente "2.500" e dois mil e quinhentos e "2.5" e dois e meio. A maquina
    // precisa da regra escrita: tres casas depois do ponto = separador de milhar.
    expect(parseBRL("2.500")).toBe(2500);
    expect(parseBRL("2.5")).toBe(2.5);
    expect(parseBRL("2.50")).toBe(2.5);
  });

  it("aceita o formato ingles que vem colado de fora", () => {
    expect(parseBRL("2,500.00")).toBe(2500);
  });

  it("devolve null quando nao da pra ler um numero", () => {
    expect(parseBRL("")).toBeNull();
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("R$")).toBeNull();
  });

  it("nao repete o bug que gravava R$ 2,50 no lugar de R$ 2.500", () => {
    // O codigo antigo era parseFloat(v.replace(",", ".")): "2.500,00" virava a
    // string "2.500.00" e o parseFloat parava no segundo ponto. O dono fechava
    // por dois mil e quinhentos e o banco guardava dois e cinquenta, calado.
    expect(parseFloat("2.500,00".replace(",", "."))).toBe(2.5);
    expect(parseBRL("2.500,00")).toBe(2500);
  });
});

describe("data do fechamento", () => {
  it("volta o mesmo dia no round-trip", () => {
    for (const dia of ["2026-01-01", "2026-03-15", "2026-08-06", "2026-12-31"]) {
      expect(toDateInput(fromDateInput(dia))).toBe(dia);
    }
  });

  it("fixa meio-dia local, senao o contrato consta como fechado na vespera", () => {
    const iso = fromDateInput("2026-08-06");
    expect(new Date(iso!).getHours()).toBe(12);
    // O ingenuo: new Date("2026-08-06") e meia-noite UTC, que no Brasil ainda e
    // dia 05. E o bug que essa funcao existe pra nao ter.
    expect(toDateInput(new Date("2026-08-06").toISOString())).toBe("2026-08-05");
  });

  it("nao inventa data a partir de vazio ou lixo", () => {
    expect(fromDateInput("")).toBeNull();
    expect(fromDateInput("abc")).toBeNull();
    expect(toDateInput(null)).toBe("");
    expect(toDateInput("nao-e-data")).toBe("");
  });

  it("todayInput sai no formato que o input[type=date] aceita", () => {
    expect(todayInput()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatadores", () => {
  it("formata telefone de 10 e 11 digitos, e devolve o resto intacto", () => {
    expect(fmtPhone("44999990000")).toBe("(44) 99999-0000");
    expect(fmtPhone("4433330000")).toBe("(44) 3333-0000");
    expect(fmtPhone("123")).toBe("123");
    expect(fmtPhone(null)).toBe("-");
  });

  it("formata CNPJ e nao mexe no que nao tem 14 digitos", () => {
    expect(fmtCnpj("39118440000103")).toBe("39.118.440/0001-03");
    expect(fmtCnpj("123")).toBe("123");
    expect(fmtCnpj(null)).toBe("-");
  });
});
