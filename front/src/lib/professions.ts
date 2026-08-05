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
  Scales,
  type Icon,
} from "@phosphor-icons/react";

import type { Ramo } from "./ramos";
import type { SearchProfile, ServiceTarget } from "./types";

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
  /** Nichos que viram ponto de partida nos chips de ramo.
   *  Tipado por RAMOS_DISPONIVEIS: sugerir um nicho fora do catalogo
   *  quebra o build em vez de virar um chip que nao acha nada. */
  suggestedNiches: Ramo[];
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
    suggestedNiches: ["Restaurante", "Hamburgueria", "Estetica", "Academia", "Barbearia", "Petshop"],
    defaultService: "trafego",
  },
  {
    id: "automacao",
    label: "Automação / Chatbot",
    descricao: "Você automatiza atendimento e organiza o WhatsApp.",
    icon: ChatCircleDots,
    mira: "Muito atendimento manual no WhatsApp.",
    suggestedNiches: ["Clinica odontologica", "Clinica de estetica", "Salao de beleza", "Petshop", "Pilates"],
    defaultService: "automacao",
  },
  {
    id: "ambos",
    label: "Tráfego + Automação",
    descricao: "Você junta anúncios e automação no mesmo pacote.",
    icon: Compass,
    mira: "Negócio que precisa atrair e atender melhor.",
    suggestedNiches: ["Estetica", "Clinica", "Academia", "Restaurante"],
    defaultService: "ambos",
  },
  {
    id: "design",
    label: "Product / UX Design",
    descricao: "Você desenha produtos e experiências digitais.",
    icon: PenNib,
    mira: "Presença digital fraca, sem site bom.",
    suggestedNiches: ["Loja de roupas", "Cafe", "Restaurante", "Fotografo"],
    defaultService: "indefinido",
  },
  {
    id: "marketing",
    label: "Marketing / Social Media",
    descricao: "Você cuida das redes e da presença da marca.",
    icon: Megaphone,
    mira: "Rede social fraca ou abandonada.",
    suggestedNiches: ["Restaurante", "Estetica", "Loja de roupas", "Academia"],
    defaultService: "marketing",
  },
  {
    id: "branding",
    label: "Branding / Identidade visual",
    descricao: "Você cria identidade e dá cara para a marca.",
    icon: PaintBrush,
    mira: "Marca sem identidade clara.",
    suggestedNiches: ["Cafe", "Loja de roupas", "Restaurante", "Fotografo"],
    defaultService: "indefinido",
  },
  {
    id: "web",
    label: "Sites / Desenvolvimento web",
    descricao: "Você constrói sites e coloca o negócio no ar.",
    icon: Globe,
    mira: "Negócio sem site.",
    suggestedNiches: ["Clinica", "Advocacia", "Imobiliaria", "Restaurante"],
    defaultService: "indefinido",
  },
  {
    id: "advocacia",
    label: "Advocacia",
    descricao: "Você presta assessoria jurídica a empresas.",
    icon: Scales,
    mira: "Empresa formalizada, com sócios, sem assessoria aparente.",
    suggestedNiches: ["Construtora", "Transportadora", "Distribuidora", "Oficina mecanica", "Restaurante"],
    defaultService: "advocacia",
  },
];

/** Busca uma profissao pelo id (ou undefined se nao existir). */
export function getProfession(id: string | null | undefined): Profession | undefined {
  if (!id) return undefined;
  return PROFESSIONS.find((p) => p.id === id);
}

// Opcoes de servico-alvo que fazem sentido pra profissao do dono. Em vez de
// mostrar sempre trafego/automacao/ambos, reflete o perfil configurado:
//  - "ambos"     -> as 3 opcoes (toggle de verdade)
//  - "trafego"   -> so trafego (servico fixo, sem escolha)
//  - "automacao" -> so automacao (servico fixo, sem escolha)
//  - "indefinido" (design/ux/marketing/branding/web) -> [] : sem servico-alvo,
//    a busca capta so pelo nicho (o controle some na tela).
export function serviceOptionsForProfile(
  profile: Pick<SearchProfile, "profession" | "default_service_target"> | null,
): ServiceTarget[] {
  const base =
    getProfession(profile?.profession)?.defaultService ??
    profile?.default_service_target ??
    "trafego";
  if (base === "ambos") return ["trafego", "automacao", "ambos"];
  if (base === "indefinido") return [];
  return [base];
}
