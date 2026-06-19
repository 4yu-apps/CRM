// Seed do modo mock: leads de exemplo (Maringa/PR), portados do claude-design-ref.
// Espelha a forma do schema. Timestamps relativos para parecer "vivo".
// ATENCAO: dados dev-only. Nunca chegam ao banco de producao.
import type { ActivityEvent, FieldProvenance, Lead, LeadSource, LeadStatus, ScoreReason, ScanCoverage, SearchProfile, ServiceTarget, StatusHistory } from "../types";

export const DEMO_OWNER = "00000000-0000-0000-0000-0000000000aa";

const now = () => Date.now();
const daysAgo = (d: number) => new Date(now() - d * 86400_000).toISOString();
const hoursAgo = (h: number) => new Date(now() - h * 3600_000).toISOString();

let _id = 0;
const uid = (p: string) => `${p}-${(++_id).toString(36).padStart(4, "0")}`;
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "");

interface SeedSpec {
  business_name: string;
  category: string;
  neighborhood: string;
  phone: string;
  instagram?: string;
  site?: boolean;
  cnpj?: string;
  owner_name?: string;
  rating: number;
  reviews_count: number;
  status: LeadStatus;
  service: ServiceTarget;
  ads?: boolean;
  score: number;
  motivo: string;
  sinais: string[];
  draft1: string;
  draft2: string;
  opt_out?: boolean;
  archived?: boolean;
  createdDaysAgo: number;
  updatedHoursAgo: number;
}

const SPECS: SeedSpec[] = [
  {
    business_name: "Burguer do Tonho",
    category: "Hamburgueria",
    neighborhood: "Zona 7",
    phone: "44998123344",
    instagram: "@burgerdotonho",
    site: true,
    cnpj: "31.402.118/0001-09",
    owner_name: "Antônio Ferreira",
    rating: 4.7,
    reviews_count: 324,
    status: "rascunho_pronto",
    service: "trafego",
    ads: false,
    score: 84,
    motivo:
      "Nota 4,7 com 324 avaliacoes, ainda nao anuncia e o site nao tem rastreamento. Negocio movimentado que ainda nao investe em trafego, bate certinho com o seu perfil.",
    sinais: [
      "Perfil ativo no Instagram, mas sem anuncio rodando",
      "Site no ar e sem pixel instalado",
      "Bastante avaliacao recente, movimento real",
    ],
    draft1:
      "Oi Antonio, tudo certo? Vi o movimento do Burguer do Tonho aqui na Zona 7 e o trabalho de voces ficou muito bom. Eu ajudo hamburgueria daqui a lotar mais nos dias parados com anuncio bem feito. Posso te mostrar rapidinho como funciona?",
    draft2:
      "Funciona assim: monto o anuncio pra quem busca hamburguer perto, voce recebe o pedido e eu acompanho o resultado. Te mando um exemplo de como ficaria pro Burguer do Tonho?",
    createdDaysAgo: 0,
    updatedHoursAgo: 2,
  },
  {
    business_name: "Studio Bella Estetica",
    category: "Estetica",
    neighborhood: "Zona Sul",
    phone: "44996442210",
    instagram: "@studiobella.mga",
    site: false,
    cnpj: "42.118.903/0001-55",
    owner_name: "Marina Lopes",
    rating: 4.9,
    reviews_count: 186,
    status: "rascunho_pronto",
    service: "trafego",
    ads: false,
    score: 86,
    motivo:
      "Nota 4,9, Instagram caprichado e nenhum anuncio rodando. Clinica de estetica com prova social forte e sem site, o tipo que cresce rapido com trafego pago.",
    sinais: [
      "Instagram bonito e ativo, sem impulsionamento",
      "Nao tem site nem rastreamento",
      "Avaliacoes altas e constantes",
    ],
    draft1:
      "Oi Marina! Vi o trabalho do Studio Bella e o capricho de voces chama atencao. Eu ajudo clinica de estetica daqui a encher a agenda nos horarios vagos com anuncio certo pro publico da regiao. Te mostro como?",
    draft2:
      "A ideia e simples: anuncio pra mulheres da regiao que procuram esse tipo de servico, e voce so recebe quem ja chega interessado. Posso montar um exemplo pra voce ver?",
    createdDaysAgo: 0,
    updatedHoursAgo: 3,
  },
  {
    business_name: "Barbearia Navalha de Ouro",
    category: "Barbearia",
    neighborhood: "Centro",
    phone: "44992037788",
    instagram: "@navalhadeouro",
    site: true,
    cnpj: "29.880.441/0001-12",
    owner_name: "Diego Martins",
    rating: 4.8,
    reviews_count: 541,
    status: "rascunho_pronto",
    service: "trafego",
    ads: false,
    score: 81,
    motivo:
      "541 avaliacoes com nota 4,8, no Centro, e ainda nao anuncia. Barbearia consolidada que pode encher os horarios da semana com pouco investimento.",
    sinais: ["Volume muito alto de avaliacoes", "Site simples, sem rastreamento", "Sem anuncio ativo"],
    draft1:
      "E ai Diego, suave? A Navalha de Ouro tem uma fila de cliente fiel, da pra ver pelas avaliacoes. Eu ajudo barbearia a encher os horarios parados da semana com anuncio. Quer que eu te mostre rapidinho?",
    draft2:
      "Pego os horarios mais fracos e coloco anuncio pra quem ta procurando barbeiro perto. Voce enche a agenda sem depender so do boca a boca. Te mando um exemplo?",
    createdDaysAgo: 1,
    updatedHoursAgo: 5,
  },
  {
    business_name: "Pet Lar",
    category: "Petshop",
    neighborhood: "Jd. Alvorada",
    phone: "44991156620",
    instagram: "@petlar.mga",
    site: false,
    cnpj: "37.660.215/0001-80",
    owner_name: "Claudia Reis",
    rating: 4.6,
    reviews_count: 98,
    status: "rascunho_pronto",
    service: "automacao",
    ads: false,
    score: 73,
    motivo:
      "Petshop de bairro com clientela fiel e agendamento de banho e tosa tudo na mao pelo WhatsApp. Tipo de negocio que ganha tempo e nao perde cliente com atendimento automatico.",
    sinais: [
      "Atende e agenda tudo manual no WhatsApp",
      "Movimento constante de banho e tosa",
      "Sem site nem chatbot",
    ],
    draft1:
      "Oi Claudia, tudo bem? O Pet Lar tem uma clientela fiel ali no Alvorada. Eu monto um atendimento automatico no WhatsApp que agenda banho e tosa sozinho, sem voce perder cliente na correria. Quer que eu te mostre como funciona?",
    draft2:
      "O chatbot responde na hora, marca o horario e ja manda o lembrete pro cliente. Voce so chega e atende. Te mostro um exemplo rodando?",
    createdDaysAgo: 1,
    updatedHoursAgo: 6,
  },
  {
    business_name: "Cantina Nonna",
    category: "Restaurante",
    neighborhood: "Zona 5",
    phone: "44998771045",
    instagram: "@cantinanonna",
    site: true,
    cnpj: "33.204.778/0001-31",
    owner_name: "Paolo Bianchi",
    rating: 4.7,
    reviews_count: 412,
    status: "rascunho_pronto",
    service: "trafego",
    ads: false,
    score: 70,
    motivo:
      "Restaurante com nota 4,7 e 412 avaliacoes. Tem site com rastreamento mas nao anuncia, entao a base ja esta pronta pra comecar a campanha sem atrito.",
    sinais: ["Site ja tem pixel instalado", "Ainda nao roda anuncio", "Avaliacoes fortes e movimento alto"],
    draft1:
      "Ola Paolo, tudo certo? A Cantina Nonna ja tem uma estrutura boa de site. Eu ajudo restaurante a encher as mesas nos dias mais fracos com anuncio bem direcionado. Quer ver como ficaria pra voces?",
    draft2:
      "Como ja tem pixel, da pra comecar rapido e medir tudo. Anuncio pros dias parados, foco em quem ta perto na hora da fome. Te mando uma previa?",
    createdDaysAgo: 2,
    updatedHoursAgo: 8,
  },
  {
    business_name: "Doce Encanto Confeitaria",
    category: "Confeitaria",
    neighborhood: "Zona 7",
    phone: "44995503322",
    instagram: "@doceencanto.mga",
    site: false,
    cnpj: "40.991.336/0001-07",
    owner_name: "Fernanda Souza",
    rating: 4.8,
    reviews_count: 154,
    status: "rascunho_pronto",
    service: "trafego",
    ads: false,
    score: 80,
    motivo:
      "Confeitaria com nota 4,8, foco em encomendas e festas, sem site e sem anuncio. Ticket bom e publico que busca por proximidade, bate com o perfil.",
    sinais: ["Trabalha com encomenda, ticket alto", "Sem site e sem anuncio", "Instagram com fotos boas dos produtos"],
    draft1:
      "Oi Fernanda! Os bolos do Doce Encanto estao lindos no Instagram. Eu ajudo confeitaria a receber mais pedido de festa e encomenda com anuncio pra regiao. Te mostro como funciona?",
    draft2:
      "Coloco anuncio pra quem procura bolo de festa e encomenda perto de voce. Chega mais pedido sem voce ter que correr atras. Posso te mandar um exemplo?",
    createdDaysAgo: 3,
    updatedHoursAgo: 10,
  },
  {
    business_name: "FitZone Academia",
    category: "Academia",
    neighborhood: "Novo Centro",
    phone: "44994401199",
    instagram: "@fitzone.mga",
    site: true,
    cnpj: "28.115.660/0001-44",
    owner_name: "Rodrigo Alves",
    rating: 4.5,
    reviews_count: 268,
    status: "enviado",
    service: "trafego",
    ads: true,
    score: 64,
    motivo:
      "Academia que ja anuncia, entao o angulo aqui e otimizacao, nao primeiro contato. Da pra baixar o custo por matricula.",
    sinais: ["Ja roda anuncio", "Site com rastreamento", "Volume bom de avaliacao"],
    draft1:
      "Oi Rodrigo, vi que a FitZone ja anuncia. Eu ajudo academia a baixar o custo por matricula e melhorar o retorno. Posso dar uma olhada no que esta rodando?",
    draft2: "Faco um diagnostico rapido do que ta no ar e te mostro onde da pra economizar. Sem compromisso, topa?",
    createdDaysAgo: 4,
    updatedHoursAgo: 5,
  },
  {
    business_name: "Odonto Sorria",
    category: "Odontologia",
    neighborhood: "Centro",
    phone: "44993302255",
    instagram: "@odontosorria",
    site: true,
    cnpj: "30.770.118/0001-90",
    owner_name: "Helena Costa",
    rating: 4.9,
    reviews_count: 702,
    status: "enviado",
    service: "ambos",
    ads: false,
    score: 88,
    motivo:
      "Clinica com reputacao altissima e 702 avaliacoes, ainda sem anuncio. Volume alto pra escalar com trafego e agendamento todo manual pra automatizar, encaixa nos dois servicos.",
    sinais: ["Reputacao altissima, 702 avaliacoes", "Ainda nao anuncia", "Agendamento todo manual no WhatsApp"],
    draft1:
      "Oi Dra. Helena, a Odonto Sorria tem uma reputacao invejavel. Eu ajudo clinica a transformar isso em mais agendamento, com anuncio e com atendimento automatico no WhatsApp. Posso mostrar?",
    draft2:
      "Da pra anunciar pra quem procura dentista perto e ainda automatizar o agendamento pra nao perder ninguem. Te mostro os dois lados rapidinho?",
    createdDaysAgo: 5,
    updatedHoursAgo: 9,
  },
  {
    business_name: "Cafe Origem",
    category: "Cafeteria",
    neighborhood: "Zona 7",
    phone: "44998774400",
    instagram: "@cafeorigem",
    site: false,
    cnpj: "41.220.665/0001-18",
    owner_name: "Lucas Prado",
    rating: 4.8,
    reviews_count: 233,
    status: "respondeu",
    service: "trafego",
    ads: false,
    score: 76,
    motivo: "Cafeteria charmosa, publico jovem, otima pra anuncio local. Sem anuncio rodando ainda.",
    sinais: ["Publico jovem e engajado", "Sem anuncio", "Boa presenca no Instagram"],
    draft1:
      "Oi Lucas! O Cafe Origem tem uma vibe otima. Eu ajudo cafeteria a atrair mais gente da regiao com anuncio. Bora conversar?",
    draft2: "Anuncio pra quem ta perto procurando cafe e um lugar bom pra trabalhar. Te mando um exemplo?",
    createdDaysAgo: 6,
    updatedHoursAgo: 8,
  },
  {
    business_name: "Auto Spa Brilho",
    category: "Estetica automotiva",
    neighborhood: "Zona 8",
    phone: "44991128080",
    instagram: "@autospabrilho",
    site: false,
    cnpj: "35.991.220/0001-66",
    owner_name: "Tiago Nunes",
    rating: 4.7,
    reviews_count: 141,
    status: "interessado",
    service: "trafego",
    ads: false,
    score: 79,
    motivo: "Servico de ticket alto, sem anuncio, demanda crescente. Bom alvo pra trafego local.",
    sinais: ["Ticket alto", "Sem anuncio", "Demanda crescente na regiao"],
    draft1:
      "Fala Tiago! O Auto Spa Brilho entrega um acabamento top. Eu ajudo a trazer mais agendamento de polimento e vitrificacao com anuncio. Te mostro?",
    draft2: "Coloco anuncio pra quem procura esse servico na regiao e o agendamento enche. Posso te mostrar como?",
    createdDaysAgo: 7,
    updatedHoursAgo: 12,
  },
  {
    business_name: "Studio Namaste Yoga",
    category: "Bem-estar",
    neighborhood: "Zona Sul",
    phone: "44992205511",
    instagram: "@studionamaste",
    site: true,
    cnpj: "43.005.118/0001-22",
    owner_name: "Beatriz Lima",
    rating: 5.0,
    reviews_count: 88,
    status: "reuniao",
    service: "trafego",
    ads: false,
    score: 82,
    motivo: "Nota maxima, nicho fiel, otimo pra captacao de novas turmas com trafego.",
    sinais: ["Nota 5,0", "Nicho fiel", "Sem anuncio"],
    draft1:
      "Oi Beatriz! O Studio Namaste tem nota maxima. Eu ajudo studio a lotar as turmas novas com anuncio pro publico certo. Marca uma conversa rapida comigo?",
    draft2: "A gente atrai gente da regiao interessada em yoga e enche as turmas novas. Te mostro um exemplo na call?",
    createdDaysAgo: 8,
    updatedHoursAgo: 30,
  },
  {
    business_name: "Pilates Corpo Leve",
    category: "Pilates",
    neighborhood: "Centro",
    phone: "44996607733",
    instagram: "@pilatescorpoleve",
    site: true,
    cnpj: "39.118.440/0001-03",
    owner_name: "Camila Duarte",
    rating: 4.9,
    reviews_count: 175,
    status: "fechado",
    service: "trafego",
    ads: true,
    score: 78,
    motivo: "Fechou contrato. Caso de sucesso, agenda cheia.",
    sinais: ["Cliente ativo", "Agenda cheia", "Anuncio rodando com a gente"],
    draft1: "Obrigado pela parceria, Camila! Seguimos otimizando os anuncios pra manter a agenda cheia.",
    draft2: "Mes que vem ajusto a campanha pra focar nas turmas novas. Qualquer coisa, to por aqui.",
    createdDaysAgo: 20,
    updatedHoursAgo: 60,
  },
];

const PROV_SOURCE: Record<string, LeadSource> = {
  business_name: "google_maps",
  phone: "google_maps",
  owner_name: "cnpj_brasilapi",
  cnpj: "cnpj_brasilapi",
  instagram: "instagram",
};

const BASE_PATH: LeadStatus[] = ["bruto", "enriquecido", "qualificado", "rascunho_pronto", "aprovado", "enviado"];
function pathFor(status: LeadStatus): LeadStatus[] {
  switch (status) {
    case "rascunho_pronto":
      return BASE_PATH.slice(0, 4);
    case "enviado":
      return BASE_PATH;
    case "respondeu":
      return [...BASE_PATH, "respondeu"];
    case "interessado":
      return [...BASE_PATH, "respondeu", "interessado"];
    case "reuniao":
      return [...BASE_PATH, "respondeu", "reuniao"];
    case "fechado":
      return [...BASE_PATH, "respondeu", "interessado", "reuniao", "proposta", "fechado"];
    default:
      return [status];
  }
}

export function buildSeed(): { leads: Lead[]; provenance: FieldProvenance[]; history: StatusHistory[] } {
  _id = 0;
  const leads: Lead[] = [];
  const provenance: FieldProvenance[] = [];
  const history: StatusHistory[] = [];

  for (const s of SPECS) {
    const id = uid("lead");
    const website = s.site ? `https://${slug(s.business_name)}.com.br` : null;
    const score_reason: ScoreReason = {
      total: s.score,
      summary: s.motivo,
      criteria: s.sinais.map((note) => ({ label: "Sinal", points: 1, note })),
    };
    leads.push({
      id,
      owner_id: DEMO_OWNER,
      status: s.status,
      business_name: s.business_name,
      cnpj: s.cnpj ?? null,
      phone: s.phone,
      email: null,
      instagram: s.instagram ?? null,
      website,
      maps_place_id: `place_${id}`,
      maps_url: null,
      rating: s.rating,
      reviews_count: s.reviews_count,
      category: s.category,
      address: null,
      neighborhood: s.neighborhood,
      city: "Maringa",
      state: "PR",
      owner_name: s.owner_name ?? null,
      score: s.score,
      score_reason,
      service_target: s.service,
      ads_active: s.ads ?? null,
      opt_out: s.opt_out ?? false,
      opt_out_at: s.opt_out ? hoursAgo(s.updatedHoursAgo) : null,
      archived: s.archived ?? false,
      created_at: daysAgo(s.createdDaysAgo),
      updated_at: hoursAgo(s.updatedHoursAgo),
      draft_msg1: s.draft1,
      draft_msg2: s.draft2,
    });

    // proveniencia gerada dos campos preenchidos
    const provFields: [string, string | null][] = [
      ["business_name", s.business_name],
      ["phone", s.phone],
      ["owner_name", s.owner_name ?? null],
      ["cnpj", s.cnpj ?? null],
      ["instagram", s.instagram ?? null],
    ];
    for (const [field, value] of provFields) {
      if (!value) continue;
      provenance.push({
        id: uid("prov"),
        lead_id: id,
        field_name: field,
        source: PROV_SOURCE[field],
        value,
        confidence: field === "business_name" ? 1 : 0.85,
        found_at: daysAgo(s.createdDaysAgo),
      });
    }
    provenance.push({
      id: uid("prov"),
      lead_id: id,
      field_name: "ads_active",
      source: "meta_ad_library",
      value: s.ads ? "sim" : "nao",
      confidence: 0.8,
      found_at: daysAgo(s.createdDaysAgo),
    });

    // historico gerado do caminho ate o status atual
    const path = pathFor(s.status);
    let prev: LeadStatus | null = null;
    path.forEach((st, i) => {
      const actor: StatusHistory["actor"] = i < 4 ? "system" : "human";
      history.push({
        id: uid("hist"),
        lead_id: id,
        from_status: prev,
        to_status: st,
        actor,
        changed_by: actor === "system" ? null : DEMO_OWNER,
        note: null,
        changed_at: hoursAgo(s.updatedHoursAgo + (path.length - 1 - i) * 12),
      });
      prev = st;
    });
  }

  return { leads, provenance, history };
}

// ---- Perfil de busca demo (dev-only, nao e dado de producao) ----
export const DEMO_PROFILE: SearchProfile = {
  owner_id: DEMO_OWNER,
  niches: ["Hamburgueria", "Barbearia", "Estetica", "Restaurante", "Petshop"],
  city: "Maringa",
  state: "PR",
  radius: "10km",
  default_service_target: "trafego",
  autopilot: false,
  created_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
  updated_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
};

// ---- Zonas de cobertura demo (dev-only, nao e dado de producao) ----
export const DEMO_COVERAGE: ScanCoverage[] = [
  {
    id: "cov-0001",
    owner_id: DEMO_OWNER,
    region_key: "maringa-pr-hamburgueria",
    region_name: "Maringa PR",
    niche: "Hamburgueria",
    center_lat: -23.4273,
    center_lng: -51.9375,
    bbox: null,
    pct: 87,
    result_count: 34,
    covered_at: new Date(Date.now() - 1 * 86400_000).toISOString(),
  },
  {
    id: "cov-0002",
    owner_id: DEMO_OWNER,
    region_key: "maringa-pr-barbearia",
    region_name: "Maringa PR",
    niche: "Barbearia",
    center_lat: -23.4273,
    center_lng: -51.9375,
    bbox: null,
    pct: 62,
    result_count: 28,
    covered_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
  },
  {
    id: "cov-0003",
    owner_id: DEMO_OWNER,
    region_key: "maringa-pr-estetica",
    region_name: "Maringa PR",
    niche: "Estetica",
    center_lat: -23.4273,
    center_lng: -51.9375,
    bbox: null,
    pct: 45,
    result_count: 19,
    covered_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
  },
];

// ---- Eventos de atividade demo (dev-only, nao e dado de producao) ----
export const DEMO_ACTIVITY: ActivityEvent[] = [
  {
    id: "act-0001",
    owner_id: DEMO_OWNER,
    tipo: "varredura",
    text: "Varredura em Hamburgueria retornou 34 resultados em Maringa PR",
    ref_count: 34,
    created_at: new Date(Date.now() - 1 * 3600_000).toISOString(),
  },
  {
    id: "act-0002",
    owner_id: DEMO_OWNER,
    tipo: "enriquecimento",
    text: "Enriquecimento de 8 leads com dados de CNPJ e Instagram",
    ref_count: 8,
    created_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
  },
  {
    id: "act-0003",
    owner_id: DEMO_OWNER,
    tipo: "rascunho",
    text: "Rascunho gerado para Burguer do Tonho",
    ref_count: 1,
    created_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
  },
  {
    id: "act-0004",
    owner_id: DEMO_OWNER,
    tipo: "busca",
    text: "Busca manual por barbearias no Centro de Maringa",
    ref_count: 12,
    created_at: new Date(Date.now() - 10 * 3600_000).toISOString(),
  },
  {
    id: "act-0005",
    owner_id: DEMO_OWNER,
    tipo: "descarte",
    text: "3 leads descartados apos analise de perfil",
    ref_count: 3,
    created_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
  },
];
