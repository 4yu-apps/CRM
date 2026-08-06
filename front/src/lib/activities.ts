// Quando esse lead foi tocado pela ultima vez.
//
// Duas datas competem pra responder isso, e elas NAO sao a mesma coisa:
//
//   last_activity_at  toque de verdade (ligacao, reuniao, mensagem, nota)
//   updated_at        qualquer escrita na linha, incluindo o robo enriquecendo
//                     ou alguem corrigindo a cidade
//
// A segunda e um proxy ruim, e e justamente por isso que a primeira existe. Mas
// a primeira comeca vazia pra base inteira: no dia em que a linha do tempo
// entrou, nenhum dos leads ja cadastrados tinha atividade registrada. Trocar uma
// pela outra sem rede faria todo lead enviado aparecer como abandonado de uma
// vez, e o alerta que deveria chamar atencao viraria ruido que ninguem le.
//
// Por isso o alerta usa fallback e a coluna nao usa. Sao perguntas diferentes:
// "vale eu me preocupar com essa conta?" aceita a melhor estimativa disponivel;
// "quando foi o ultimo toque?" tem que responder a verdade ou admitir que nao
// sabe.
import type { Lead } from "./types";

const DIA = 86_400_000;

/** Houve toque registrado de verdade (nao e estimativa). */
export function hasRealTouch(lead: Lead): boolean {
  return !!lead.last_activity_at;
}

/**
 * Melhor estimativa de "ultimo contato", pra heuristica de abandono.
 * Cai em updated_at quando o lead ainda nao tem toque registrado.
 */
export function lastTouchAt(lead: Lead): string {
  return lead.last_activity_at ?? lead.updated_at;
}

/** Dias desde o ultimo toque estimado. */
export function daysSinceTouch(lead: Lead, now = Date.now()): number {
  return Math.floor((now - +new Date(lastTouchAt(lead))) / DIA);
}
