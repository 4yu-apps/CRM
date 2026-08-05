// Areas de atuacao do advogado. So aparecem na config quando a area
// "advocacia" esta marcada — cinco cards juridicos no seletor de area
// poluiriam a tela de todo mundo.
//
// Cada area pesa criterios diferentes do score na esteira (ver
// scoring._AREA_WEIGHTS): trabalhista olha ramo de risco e idade; tributario
// olha regime e capital; societario olha o QSA; consumidor olha reputacao;
// LGPD olha ausencia de politica de privacidade.

export interface LegalArea {
  /** Identificador estavel, guardado em search_profile.legal_areas. */
  id: string;
  label: string;
  /** O que essa area procura numa empresa (ajuda a pessoa a se reconhecer). */
  descricao: string;
}

export const LEGAL_AREAS: LegalArea[] = [
  {
    id: "trabalhista",
    label: "Trabalhista",
    descricao: "Empresas com folha e rotatividade alta.",
  },
  {
    id: "tributario",
    label: "Tributário",
    descricao: "Empresas fora do Simples, com capital relevante.",
  },
  {
    id: "societario",
    label: "Societário / Empresarial",
    descricao: "Sociedades com dois ou mais sócios.",
  },
  {
    id: "consumidor",
    label: "Consumidor",
    descricao: "Negócios com relação de consumo intensa.",
  },
  {
    id: "lgpd",
    label: "LGPD / Digital",
    descricao: "Quem coleta dado e não tem política de privacidade.",
  },
];

export function getLegalArea(id: string | null | undefined): LegalArea | undefined {
  if (!id) return undefined;
  return LEGAL_AREAS.find((a) => a.id === id);
}
