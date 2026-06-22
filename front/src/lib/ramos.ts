export const RAMOS_DISPONIVEIS = [
  "Academia",
  "Barbearia",
  "Cafe",
  "Clinica odontologica",
  "Consultorio",
  "Estetica",
  "Escritorio contabil",
  "Farmacia",
  "Fotografo",
  "Hotel",
  "Loja de roupas",
  "Manicure",
  "Massagem",
  "Otica",
  "Petshop",
  "Pilates",
  "Pousada",
  "Restaurante",
  "Salao de beleza",
  "Spa",
] as const;

export type Ramo = (typeof RAMOS_DISPONIVEIS)[number];
