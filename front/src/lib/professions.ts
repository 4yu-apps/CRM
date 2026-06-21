// Catalogo de profissoes (verticais). Cada usuario escolhe a sua no primeiro
// acesso; isso define o servico-alvo padrao e os nichos sugeridos na busca.
// Base do produto multi-vertical (Fase 2 do roadmap).

import {
  ChartLineUp,
  ChatCircleDots,
  Compass,
  Megaphone,
  PaintBrush,
  Globe,
  PenNib,
  type Icon,
} from "@phosphor-icons/react";

import type { ServiceTarget } from "./types";

export interface Profession {
  /** Identificador estavel, guardado no perfil (search_profile.profession). */
  id: string;
  /** Nome legivel da area. */
  label: string;
  /** Frase curta que descreve o foco da area. */
  descricao: string;
  /** Icone Phosphor que representa a area. */
  icon: Icon;
  /** Quem essa area costuma mirar (ajuda o usuario a se reconhecer). */
  mira: string;
  /** Nichos que viram ponto de partida nos chips de ramo. */
  suggestedNiches: string[];
  /** Servico-alvo padrao pre-selecionado ao escolher a area. */
  defaultService: ServiceTarget;
}

export const PROFESSIONS: Profession[] = [
  {
    id: "trafego",
    label: "Gestão de tráfego",
    descricao: "Você cuida dos anúncios e leva clientes para o negócio.",
    icon: ChartLineUp,
    mira: "Negócio com movimento que ainda não anuncia.",
    suggestedNiches: ["Restaurante", "Hamburgueria", "Estética", "Academia", "Barbearia", "Petshop"],
    defaultService: "trafego",
  },
  {
    id: "automacao",
    label: "Automação / Chatbot",
    descricao: "Você automatiza atendimento e organiza o WhatsApp.",
    icon: ChatCircleDots,
    mira: "Muito atendimento manual no WhatsApp.",
    suggestedNiches: ["Clínica odontológica", "Clínica de estética", "Salão de beleza", "Petshop", "Pilates"],
    defaultService: "automacao",
  },
  {
    id: "ambos",
    label: "Tráfego + Automação",
    descricao: "Você junta anúncios e automação no mesmo pacote.",
    icon: Compass,
    mira: "Negócio que precisa atrair e atender melhor.",
    suggestedNiches: ["Estética", "Clínica", "Academia", "Restaurante"],
    defaultService: "ambos",
  },
  {
    id: "design",
    label: "Product / UX Design",
    descricao: "Você desenha produtos e experiências digitais.",
    icon: PenNib,
    mira: "Presença digital fraca, sem site bom.",
    suggestedNiches: ["Loja de roupas", "Cafeteria", "Startup", "Restaurante", "Estúdio"],
    defaultService: "indefinido",
  },
  {
    id: "marketing",
    label: "Marketing / Social Media",
    descricao: "Você cuida das redes e da presença da marca.",
    icon: Megaphone,
    mira: "Rede social fraca ou abandonada.",
    suggestedNiches: ["Restaurante", "Estética", "Loja de roupas", "Academia"],
    defaultService: "indefinido",
  },
  {
    id: "branding",
    label: "Branding / Identidade visual",
    descricao: "Você cria identidade e dá cara para a marca.",
    icon: PaintBrush,
    mira: "Marca sem identidade clara.",
    suggestedNiches: ["Cafeteria", "Loja de roupas", "Restaurante", "Estúdio"],
    defaultService: "indefinido",
  },
  {
    id: "web",
    label: "Sites / Desenvolvimento web",
    descricao: "Você constrói sites e coloca o negócio no ar.",
    icon: Globe,
    mira: "Negócio sem site.",
    suggestedNiches: ["Clínica", "Advocacia", "Imobiliária", "Restaurante"],
    defaultService: "indefinido",
  },
];

/** Busca uma profissao pelo id (ou undefined se nao existir). */
export function getProfession(id: string | null | undefined): Profession | undefined {
  if (!id) return undefined;
  return PROFESSIONS.find((p) => p.id === id);
}
