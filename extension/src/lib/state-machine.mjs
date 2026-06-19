// Maquina de estados — espelha lead_status_transitions (Fase 0).
// Os botoes contextuais da extensao (secao 6 do mapa) saem daqui.

export const TRANSITIONS = {
  bruto: ["enriquecido", "descartado"],
  enriquecido: ["qualificado", "descartado"],
  qualificado: ["rascunho_pronto", "descartado"],
  rascunho_pronto: ["aprovado", "descartado"],
  aprovado: ["enviado"],
  enviado: ["respondeu", "sem_resposta", "descartado"],
  sem_resposta: ["enviado", "descartado"],
  respondeu: ["interessado", "sem_interesse", "reuniao"],
  interessado: ["reuniao", "proposta", "perdido"],
  reuniao: ["proposta", "perdido"],
  proposta: ["fechado", "perdido"],
  descartado: ["enriquecido"],
  sem_interesse: [],
  fechado: [],
  perdido: [],
};

export const STATUS_LABEL = {
  bruto: "Bruto",
  enriquecido: "Enriquecido",
  qualificado: "Qualificado",
  rascunho_pronto: "Rascunho pronto",
  aprovado: "Aprovado",
  enviado: "Enviado",
  sem_resposta: "Sem resposta",
  respondeu: "Respondeu",
  interessado: "Interessado",
  reuniao: "Reuniao",
  proposta: "Proposta",
  fechado: "Fechado",
  descartado: "Descartado",
  sem_interesse: "Sem interesse",
  perdido: "Perdido",
};

// Rotulos dos botoes (iguais aos do front/mapa). Default = STATUS_LABEL[to].
const TRANSITION_LABELS = {
  "bruto->enriquecido": "Enriquecer",
  "bruto->descartado": "Descartar",
  "enriquecido->qualificado": "Qualificar",
  "enriquecido->descartado": "Descartar",
  "qualificado->rascunho_pronto": "Gerar rascunho",
  "qualificado->descartado": "Descartar",
  "rascunho_pronto->descartado": "Descartar",
  "enviado->respondeu": "Respondeu",
  "enviado->sem_resposta": "Sem resposta",
  "enviado->descartado": "Numero errado",
  "respondeu->reuniao": "Agendou reuniao",
  "respondeu->interessado": "Interessado",
  "respondeu->sem_interesse": "Sem interesse",
  "interessado->reuniao": "Agendar reuniao",
  "interessado->proposta": "Virou proposta",
  "interessado->perdido": "Marcar perdido",
  "reuniao->proposta": "Virou proposta",
  "reuniao->perdido": "Marcar perdido",
  "proposta->fechado": "Fechar",
  "proposta->perdido": "Marcar perdido",
  "rascunho_pronto->aprovado": "Aprovar",
  "aprovado->enviado": "Marquei enviado",
  "sem_resposta->enviado": "Reenviei (follow-up)",
  "sem_resposta->descartado": "Descartar",
  "descartado->enriquecido": "Reativar",
};

const CONTACT_STATUSES = new Set(["rascunho_pronto", "aprovado", "enviado"]);

export function transitionLabel(from, to) {
  return TRANSITION_LABELS[`${from}->${to}`] || STATUS_LABEL[to];
}

// Botoes contextuais para o status atual: [{ to, label, blocked }]
export function contextualButtons(status, optOut = false) {
  return (TRANSITIONS[status] || []).map((to) => ({
    to,
    label: transitionLabel(status, to),
    blocked: optOut && CONTACT_STATUSES.has(to),
  }));
}
