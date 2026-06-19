// Seed do modo mock — leads de exemplo (Maringa/PR, ICP de trafego/design).
// Espelha a forma do schema. Timestamps relativos para parecer "vivo".
import type { FieldProvenance, Lead, LeadSource, StatusHistory } from "../types";

export const DEMO_OWNER = "00000000-0000-0000-0000-0000000000aa";

const now = () => Date.now();
const daysAgo = (d: number) => new Date(now() - d * 86400_000).toISOString();
const hoursAgo = (h: number) => new Date(now() - h * 3600_000).toISOString();

let _id = 0;
const uid = (p: string) => `${p}-${(++_id).toString(36).padStart(4, "0")}`;

interface SeedSpec {
  business_name: string;
  category: string;
  city?: string;
  neighborhood?: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  owner_name?: string;
  rating?: number;
  reviews_count?: number;
  status: Lead["status"];
  score?: number;
  scoreNote?: string;
  opt_out?: boolean;
  draft1?: string;
  draft2?: string;
  createdDaysAgo: number;
  updatedHoursAgo: number;
  // proveniencia: [campo, fonte, valor, confianca?]
  prov?: [string, LeadSource, string, number?][];
  // historico de status (do mais antigo ao atual), [status, ator, horasAtras, nota?]
  hist?: [Lead["status"], StatusHistory["actor"], number, string?][];
}

const SPECS: SeedSpec[] = [
  {
    business_name: "Pizzaria Forno di Maria",
    category: "Pizzaria",
    city: "Maringa",
    neighborhood: "Zona 7",
    phone: "44999990001",
    rating: 4.6,
    reviews_count: 312,
    status: "bruto",
    createdDaysAgo: 0,
    updatedHoursAgo: 3,
    prov: [["business_name", "google_maps", "Pizzaria Forno di Maria", 1], ["phone", "google_maps", "(44) 99999-0001", 0.9]],
    hist: [["bruto", "system", 3]],
  },
  {
    business_name: "Studio Bella Estetica",
    category: "Estetica",
    city: "Maringa",
    neighborhood: "Zona 1",
    cnpj: "11222333000144",
    phone: "44999990002",
    instagram: "@studiobella",
    rating: 4.8,
    reviews_count: 198,
    owner_name: "Marina Alves",
    status: "enriquecido",
    createdDaysAgo: 2,
    updatedHoursAgo: 20,
    prov: [
      ["business_name", "google_maps", "Studio Bella Estetica", 1],
      ["phone", "google_maps", "(44) 99999-0002", 0.95],
      ["cnpj", "cnpj_brasilapi", "11.222.333/0001-44", 1],
      ["owner_name", "cnpj_brasilapi", "Marina Alves", 0.8],
      ["instagram", "instagram", "@studiobella", 0.7],
    ],
    hist: [["bruto", "system", 48], ["enriquecido", "system", 20]],
  },
  {
    business_name: "Hamburgueria do Ze",
    category: "Hamburgueria",
    city: "Maringa",
    neighborhood: "Centro",
    cnpj: "22333444000155",
    phone: "44999990003",
    rating: 4.4,
    reviews_count: 540,
    owner_name: "Jose Pereira",
    status: "qualificado",
    score: 82,
    scoreNote: "Nota 4.4, 540 avaliacoes, sem site (descuido digital), nao anuncia.",
    createdDaysAgo: 4,
    updatedHoursAgo: 26,
    prov: [
      ["phone", "google_maps", "(44) 99999-0003", 0.95],
      ["cnpj", "cnpj_brasilapi", "22.333.444/0001-55", 1],
      ["website", "website", "(ausente)", 1],
    ],
    hist: [["bruto", "system", 96], ["enriquecido", "system", 50], ["qualificado", "system", 26, "score 82"]],
  },
  {
    business_name: "Petshop Amigo Fiel",
    category: "Petshop",
    city: "Maringa",
    neighborhood: "Zona 5",
    phone: "44999990004",
    instagram: "@amigofielpet",
    rating: 4.7,
    reviews_count: 121,
    status: "rascunho_pronto",
    score: 76,
    scoreNote: "Nota 4.7, presenca fraca no IG, sem trafego pago detectado.",
    draft1: "Oi! Vi o Amigo Fiel no Maps — 4.7 com 121 avaliacoes e um IG bem cuidado. Voces ja rodam anuncio pra atrair cliente novo da regiao?",
    draft2: "Pergunto porque com esse nivel de avaliacao da pra escalar agendamento com trafego local barato. Faz sentido eu te mandar 2-3 ideias rapidas?",
    createdDaysAgo: 5,
    updatedHoursAgo: 6,
    prov: [
      ["phone", "google_maps", "(44) 99999-0004", 0.95],
      ["instagram", "instagram", "@amigofielpet", 0.85],
    ],
    hist: [
      ["bruto", "system", 120], ["enriquecido", "system", 70],
      ["qualificado", "system", 30, "score 76"], ["rascunho_pronto", "system", 6],
    ],
  },
  {
    business_name: "Barbearia Navalha de Ouro",
    category: "Barbearia",
    city: "Maringa",
    neighborhood: "Zona 7",
    phone: "44999990005",
    instagram: "@navalhadeouro",
    rating: 4.9,
    reviews_count: 88,
    status: "aprovado",
    score: 71,
    draft1: "Fala! Navalha de Ouro com 4.9 e fila — da pra transformar essa procura em agenda cheia o mes todo com anuncio local.",
    draft2: "Te mando uma previa de campanha sem compromisso?",
    createdDaysAgo: 6,
    updatedHoursAgo: 2,
    prov: [["phone", "google_maps", "(44) 99999-0005", 0.95], ["instagram", "instagram", "@navalhadeouro", 0.9]],
    hist: [
      ["bruto", "system", 144], ["enriquecido", "system", 90],
      ["qualificado", "system", 40], ["rascunho_pronto", "system", 12],
      ["aprovado", "human", 2, "copy ok, ajustei a abertura"],
    ],
  },
  {
    business_name: "Otica Visao Clara",
    category: "Otica",
    city: "Maringa",
    phone: "44999990006",
    rating: 4.5,
    reviews_count: 230,
    status: "enviado",
    score: 68,
    createdDaysAgo: 7,
    updatedHoursAgo: 5,
    prov: [["phone", "google_maps", "(44) 99999-0006", 0.95]],
    hist: [
      ["bruto", "system", 168], ["enriquecido", "system", 120],
      ["qualificado", "system", 60], ["rascunho_pronto", "system", 30],
      ["aprovado", "human", 10], ["enviado", "human", 5, "mandei no WhatsApp"],
    ],
  },
  {
    business_name: "Restaurante Sabor Caseiro",
    category: "Restaurante",
    city: "Maringa",
    phone: "44999990007",
    rating: 4.3,
    reviews_count: 410,
    status: "sem_resposta",
    score: 64,
    createdDaysAgo: 10,
    updatedHoursAgo: 48,
    prov: [["phone", "google_maps", "(44) 99999-0007", 0.9]],
    hist: [
      ["bruto", "system", 240], ["enriquecido", "system", 180],
      ["qualificado", "system", 120], ["rascunho_pronto", "system", 96],
      ["aprovado", "human", 80], ["enviado", "human", 72],
      ["sem_resposta", "extension", 48, "2 dias sem retorno"],
    ],
  },
  {
    business_name: "Academia CorpoFit",
    category: "Academia",
    city: "Maringa",
    phone: "44999990008",
    instagram: "@corpofit",
    rating: 4.6,
    reviews_count: 360,
    status: "respondeu",
    score: 79,
    createdDaysAgo: 9,
    updatedHoursAgo: 8,
    prov: [["phone", "google_maps", "(44) 99999-0008", 0.95], ["instagram", "instagram", "@corpofit", 0.8]],
    hist: [
      ["bruto", "system", 216], ["enriquecido", "system", 160],
      ["qualificado", "system", 100], ["rascunho_pronto", "system", 70],
      ["aprovado", "human", 50], ["enviado", "human", 40],
      ["respondeu", "extension", 8, "respondeu pedindo proposta"],
    ],
  },
  {
    business_name: "Clinica OdontoSorriso",
    category: "Clinica odontologica",
    city: "Maringa",
    phone: "44999990009",
    rating: 4.8,
    reviews_count: 150,
    status: "interessado",
    score: 85,
    createdDaysAgo: 12,
    updatedHoursAgo: 12,
    prov: [["phone", "google_maps", "(44) 99999-0009", 0.95]],
    hist: [
      ["bruto", "system", 288], ["enriquecido", "system", 220],
      ["qualificado", "system", 150], ["rascunho_pronto", "system", 110],
      ["aprovado", "human", 90], ["enviado", "human", 80],
      ["respondeu", "extension", 40], ["interessado", "human", 12, "quer entender o investimento"],
    ],
  },
  {
    business_name: "Mercado Bom Preco",
    category: "Mercearia",
    city: "Maringa",
    phone: "44999990010",
    rating: 4.2,
    reviews_count: 620,
    status: "reuniao",
    score: 73,
    createdDaysAgo: 14,
    updatedHoursAgo: 30,
    prov: [["phone", "google_maps", "(44) 99999-0010", 0.9]],
    hist: [
      ["bruto", "system", 336], ["enriquecido", "system", 260],
      ["qualificado", "system", 190], ["rascunho_pronto", "system", 150],
      ["aprovado", "human", 120], ["enviado", "human", 110],
      ["respondeu", "extension", 70], ["interessado", "human", 50],
      ["reuniao", "human", 30, "reuniao marcada pra sexta"],
    ],
  },
  {
    business_name: "Floricultura Jardim Secreto",
    category: "Floricultura",
    city: "Maringa",
    phone: "44999990011",
    instagram: "@jardimsecreto",
    rating: 4.9,
    reviews_count: 95,
    status: "proposta",
    score: 80,
    createdDaysAgo: 18,
    updatedHoursAgo: 20,
    prov: [["phone", "google_maps", "(44) 99999-0011", 0.95], ["instagram", "instagram", "@jardimsecreto", 0.85]],
    hist: [
      ["bruto", "system", 432], ["enriquecido", "system", 360],
      ["qualificado", "system", 280], ["rascunho_pronto", "system", 230],
      ["aprovado", "human", 180], ["enviado", "human", 170],
      ["respondeu", "extension", 120], ["interessado", "human", 90],
      ["reuniao", "human", 50], ["proposta", "human", 20, "proposta de R$ 1.500/mes"],
    ],
  },
  {
    business_name: "Auto Center Turbo",
    category: "Oficina mecanica",
    city: "Maringa",
    phone: "44999990012",
    rating: 4.5,
    reviews_count: 280,
    status: "fechado",
    score: 78,
    createdDaysAgo: 25,
    updatedHoursAgo: 60,
    prov: [["phone", "google_maps", "(44) 99999-0012", 0.9]],
    hist: [
      ["bruto", "system", 600], ["enriquecido", "system", 520],
      ["qualificado", "system", 440], ["rascunho_pronto", "system", 380],
      ["aprovado", "human", 320], ["enviado", "human", 300],
      ["respondeu", "extension", 240], ["interessado", "human", 200],
      ["reuniao", "human", 140], ["proposta", "human", 90],
      ["fechado", "human", 60, "fechou R$ 1.800/mes 🎉"],
    ],
  },
  {
    business_name: "Lava-Jato Gota Limpa",
    category: "Lava-jato",
    city: "Maringa",
    phone: "44999990013",
    rating: 3.9,
    reviews_count: 40,
    status: "perdido",
    score: 41,
    scoreNote: "Nota abaixo de 4.3 e poucas avaliacoes.",
    createdDaysAgo: 20,
    updatedHoursAgo: 96,
    prov: [["phone", "google_maps", "(44) 99999-0013", 0.85]],
    hist: [
      ["bruto", "system", 480], ["enriquecido", "system", 400],
      ["qualificado", "system", 320], ["rascunho_pronto", "system", 280],
      ["aprovado", "human", 230], ["enviado", "human", 220],
      ["respondeu", "extension", 180], ["interessado", "human", 150],
      ["perdido", "human", 96, "achou caro, parou de responder"],
    ],
  },
  {
    business_name: "Salao Glamour",
    category: "Salao de beleza",
    city: "Maringa",
    phone: "44999990014",
    rating: 4.1,
    reviews_count: 60,
    status: "descartado",
    createdDaysAgo: 8,
    updatedHoursAgo: 50,
    prov: [["phone", "google_maps", "(44) 99999-0014", 0.6]],
    hist: [["bruto", "system", 192], ["enriquecido", "system", 120], ["descartado", "human", 50, "numero errado"]],
  },
  {
    business_name: "Doceria Acucar & Arte",
    category: "Doceria",
    city: "Maringa",
    phone: "44999990015",
    instagram: "@acucareart",
    rating: 4.7,
    reviews_count: 140,
    status: "enriquecido",
    opt_out: true,
    createdDaysAgo: 3,
    updatedHoursAgo: 18,
    prov: [["phone", "google_maps", "(44) 99999-0015", 0.9], ["instagram", "instagram", "@acucareart", 0.8]],
    hist: [["bruto", "system", 72], ["enriquecido", "system", 18]],
  },
];

export function buildSeed(): { leads: Lead[]; provenance: FieldProvenance[]; history: StatusHistory[] } {
  _id = 0;
  const leads: Lead[] = [];
  const provenance: FieldProvenance[] = [];
  const history: StatusHistory[] = [];

  for (const s of SPECS) {
    const id = uid("lead");
    leads.push({
      id,
      owner_id: DEMO_OWNER,
      status: s.status,
      business_name: s.business_name,
      cnpj: s.cnpj ?? null,
      phone: s.phone ?? null,
      email: s.email ?? null,
      instagram: s.instagram ?? null,
      website: s.website ?? null,
      maps_place_id: `place_${id}`,
      maps_url: null,
      rating: s.rating ?? null,
      reviews_count: s.reviews_count ?? null,
      category: s.category ?? null,
      address: null,
      neighborhood: s.neighborhood ?? null,
      city: s.city ?? "Maringa",
      state: "PR",
      owner_name: s.owner_name ?? null,
      score: s.score ?? null,
      score_reason: s.score
        ? { total: s.score, criteria: [{ label: "Score do ICP", points: s.score, note: s.scoreNote }] }
        : null,
      opt_out: s.opt_out ?? false,
      opt_out_at: s.opt_out ? hoursAgo(s.updatedHoursAgo) : null,
      created_at: daysAgo(s.createdDaysAgo),
      updated_at: hoursAgo(s.updatedHoursAgo),
      draft_msg1: s.draft1 ?? null,
      draft_msg2: s.draft2 ?? null,
    });

    for (const [field, source, value, confidence] of s.prov ?? []) {
      provenance.push({
        id: uid("prov"),
        lead_id: id,
        field_name: field,
        source,
        value,
        confidence: confidence ?? null,
        found_at: daysAgo(s.createdDaysAgo),
      });
    }

    let prev: Lead["status"] | null = null;
    for (const [status, actor, h, note] of s.hist ?? []) {
      history.push({
        id: uid("hist"),
        lead_id: id,
        from_status: prev,
        to_status: status,
        actor,
        changed_by: actor === "system" ? null : DEMO_OWNER,
        note: note ?? null,
        changed_at: hoursAgo(h),
      });
      prev = status;
    }
  }

  return { leads, provenance, history };
}
