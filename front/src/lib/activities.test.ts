import { describe, it, expect } from "vitest";
import { lastTouchAt, hasRealTouch, daysSinceTouch } from "./activities";
import type { Lead } from "./types";

// O fallback aqui nao e detalhe: e o que impede o alerta de abandono de listar a
// base inteira no dia em que a linha do tempo entrou, quando nenhum lead antigo
// tinha atividade registrada.

const lead = (over: Partial<Lead>): Lead => ({ id: "l", updated_at: "2026-01-01T12:00:00Z", ...over }) as Lead;

describe("lastTouchAt", () => {
  it("prefere o toque registrado quando existe", () => {
    const l = lead({ updated_at: "2026-01-01T12:00:00Z", last_activity_at: "2026-08-01T12:00:00Z" });
    expect(lastTouchAt(l)).toBe("2026-08-01T12:00:00Z");
  });

  it("cai em updated_at quando ninguem registrou toque ainda", () => {
    expect(lastTouchAt(lead({ last_activity_at: null }))).toBe("2026-01-01T12:00:00Z");
    expect(lastTouchAt(lead({}))).toBe("2026-01-01T12:00:00Z");
  });

  it("prefere o toque mesmo quando ele e MAIS ANTIGO que updated_at", () => {
    // Caso real e contraintuitivo: o robo re-enriqueceu o lead ontem, entao
    // updated_at e recente. Isso nao e contato. A conta continua sem toque ha
    // meses, e o alerta tem que continuar gritando.
    const l = lead({ updated_at: "2026-08-05T12:00:00Z", last_activity_at: "2026-02-01T12:00:00Z" });
    expect(lastTouchAt(l)).toBe("2026-02-01T12:00:00Z");
  });
});

describe("hasRealTouch", () => {
  it("distingue estimativa de registro, pra tela poder ser honesta", () => {
    expect(hasRealTouch(lead({ last_activity_at: "2026-08-01T12:00:00Z" }))).toBe(true);
    expect(hasRealTouch(lead({ last_activity_at: null }))).toBe(false);
    expect(hasRealTouch(lead({}))).toBe(false);
  });
});

describe("daysSinceTouch", () => {
  const agora = +new Date("2026-08-06T12:00:00Z");

  it("conta os dias desde o ultimo toque", () => {
    expect(daysSinceTouch(lead({ last_activity_at: "2026-08-01T12:00:00Z" }), agora)).toBe(5);
    expect(daysSinceTouch(lead({ last_activity_at: "2026-08-06T12:00:00Z" }), agora)).toBe(0);
  });

  it("usa o fallback quando nao ha toque", () => {
    expect(daysSinceTouch(lead({ updated_at: "2026-07-30T12:00:00Z" }), agora)).toBe(7);
  });
});
