// Catalogo de ramos pesquisaveis. Um nicho so entra aqui se o resolvedor de
// Overpass souber traduzi-lo em tag OSM (sources/overpass.py _OSM_FILTERS) —
// senao vira chip que nao encontra nada.
//
// Os nomes vao SEM ACENTO de proposito: sao chave de comparacao e viajam pro
// termo de busca. professions.suggestedNiches e tipado por esta lista, entao
// sugerir um nicho que nao existe aqui quebra o build (era um bug silencioso:
// quem marcava "Sites/Web" ganhava o chip "Advocacia" e nao conseguia usa-lo).
export const RAMOS_DISPONIVEIS = [
  "Academia",
  "Acai",
  "Advocacia",
  "Barbearia",
  "Cafe",
  "Clinica",
  "Clinica de estetica",
  "Clinica odontologica",
  "Construtora",
  "Consultorio",
  "Distribuidora",
  "Escritorio contabil",
  "Estetica",
  "Farmacia",
  "Fotografo",
  "Hamburgueria",
  "Hotel",
  "Imobiliaria",
  "Industria",
  "Loja de roupas",
  "Manicure",
  "Massagem",
  "Oficina mecanica",
  "Otica",
  "Padaria",
  "Petshop",
  "Pilates",
  "Pizzaria",
  "Pousada",
  "Restaurante",
  "Salao de beleza",
  "Spa",
  "Transportadora",
] as const;

export type Ramo = (typeof RAMOS_DISPONIVEIS)[number];
