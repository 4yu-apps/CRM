// Cadencia de follow-up multi-toque (#etapa-3).
// Define a regua de toques apos o envio e os helpers de calculo de data e passo.
// Importado por followup-prompt e followup-card.
import type { MessageTemplateKind } from "./types";

export type CadenceStep = {
  step: number;
  dias: number;
  kind: MessageTemplateKind;
  rotulo: string;
};

// Regua de toques apos o envio. `dias` = quantos dias somar a data atual ao
// agendar cada toque (o intervalo conta a partir do agendamento, nao do envio).
export const CADENCE: CadenceStep[] = [
  { step: 1, dias: 0, kind: "abertura", rotulo: "Abertura" },
  { step: 2, dias: 2, kind: "follow_up", rotulo: "1º follow-up" },
  { step: 3, dias: 5, kind: "follow_up", rotulo: "2º follow-up" },
  { step: 4, dias: 12, kind: "reativacao", rotulo: "Último toque" },
];

/**
 * Retorna o proximo passo da cadencia a partir do passo atual.
 * Retorna null quando o passo atual e o ultimo (cadencia encerrada).
 */
export function proximoToque(stepAtual: number | null | undefined): CadenceStep | null {
  const atual = stepAtual ?? 1;
  return CADENCE.find((c) => c.step === atual + 1) ?? null;
}

/**
 * Calcula a data sugerida para o proximo toque.
 * Os dias sao calculados a partir de `base` (padrao: agora),
 * fixando o horario em 10h local para nao escorregar de dia ao converter para ISO/UTC.
 */
export function dataSugerida(prox: CadenceStep, base = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + prox.dias);
  d.setHours(10, 0, 0, 0);
  return d;
}
