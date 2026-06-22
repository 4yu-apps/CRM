// Tipos do dominio — espelham o schema do Supabase (Fase 0).
// Fonte da verdade do schema: supabase/migrations.

export type LeadStatus =
  | "bruto"
  | "enriquecido"
  | "qualificado"
  | "descartado"
  | "rascunho_pronto"
  | "aprovado"
  | "enviado"
  | "sem_resposta"
  | "respondeu"
  | "sem_interesse"
  | "interessado"
  | "reuniao"
  | "proposta"
  | "fechado"
  | "perdido";

export type LeadSource =
  | "google_maps"
  | "cnpj_brasilapi"
  | "cnpj_ws"
  | "instagram"
  | "website"
  | "meta_ad_library"
  | "manual"
  | "extension";

export type ActorType = "human" | "system" | "extension";

// Servico-alvo do lead (B1, dois servicos): trafego, automacao, ambos.
export type ServiceTarget = "trafego" | "automacao" | "ambos" | "indefinido";

// Tipo de cobranca do valor fechado (B8): mensal fixo ou por prazo X meses.
export type DealBilling = "mensal_fixo" | "por_prazo";

// Sinais tecnicos capturados do site do lead pelo enriquecedor.
export interface SiteSignals {
  has_fb_pixel?: boolean;
  has_google_tag?: boolean;
  has_chat_widget?: boolean;
  chat_vendor?: string | null;
  has_form?: boolean;
  mobile_ready?: boolean;
  page_kb?: number;
  slow?: boolean;
  stack?: string | null;
  https?: boolean;
  has_h1?: boolean;
  has_title?: boolean;
  has_description?: boolean;
  og_image?: boolean;
}

// score_reason (jsonb): score explicavel. summary = o "porque" em PT (motivo);
// criteria = os sinais lidos (cada um com nota curta).
export interface ScoreReason {
  total: number;
  summary?: string;
  criteria: { label: string; points: number; note?: string }[];
}

export interface Lead {
  id: string;
  owner_id: string;
  status: LeadStatus;

  business_name: string | null;
  cnpj: string | null;
  phone: string | null;
  // WhatsApp separado do telefone (o fone do Maps nem sempre e o zap).
  whatsapp?: string | null;
  email: string | null;
  instagram: string | null;
  // Pagina do Facebook (ponte pro page_id da Meta: "ja anuncia?").
  facebook?: string | null;
  website: string | null;

  maps_place_id: string | null;
  maps_url: string | null;
  rating: number | null;
  reviews_count: number | null;
  category: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;

  owner_name: string | null;

  score: number | null;
  score_reason: ScoreReason | null;
  service_target: ServiceTarget;
  ads_active?: boolean | null;

  opt_out: boolean;
  opt_out_at: string | null;

  archived: boolean;

  // Precificacao e negociacao (B8). Opcionais; nao travam o funil.
  notes?: string | null;
  suggested_value?: number | null;
  suggested_value_reason?: string | null;
  deal_value?: number | null;
  deal_billing?: DealBilling | null;
  deal_term_months?: number | null;
  deal_closed_at?: string | null;

  // Reuniao (Slice E): quando, e onde acontece. meeting_link = online
  // (Meet/Zoom/Teams); meeting_location = presencial (endereco). A Agenda e o
  // sininho de notificacoes leem o meeting_at.
  meeting_at?: string | null;
  meeting_link?: string | null;
  meeting_location?: string | null;

  created_at: string;
  updated_at: string;

  // Rascunho (Fase 3 — tabela propria depois). No front ja existe para o
  // fluxo de aprovacao "ver -> editar -> aprovar".
  draft_msg1?: string | null;
  draft_msg2?: string | null;

  // Sinais do site e taxa de correspondencia de contatos (enriquecedor).
  site_signals?: SiteSignals | null;
  match_rate?: number | null;
}

export interface FieldProvenance {
  id: string;
  lead_id: string;
  field_name: string;
  source: LeadSource;
  value: string | null;
  confidence: number | null;
  found_at: string;
}

export interface StatusHistory {
  id: string;
  lead_id: string;
  from_status: LeadStatus | null;
  to_status: LeadStatus;
  actor: ActorType;
  changed_by: string | null;
  note: string | null;
  changed_at: string;
}

// Campos editaveis a mao no front (nao inclui status — status muda via transicao).
export type LeadEditable = Partial<
  Pick<
    Lead,
    | "business_name"
    | "cnpj"
    | "phone"
    | "whatsapp"
    | "email"
    | "instagram"
    | "facebook"
    | "website"
    | "category"
    | "address"
    | "neighborhood"
    | "city"
    | "state"
    | "owner_name"
    | "draft_msg1"
    | "draft_msg2"
    | "notes"
    | "suggested_value"
    | "suggested_value_reason"
    | "deal_value"
    | "deal_billing"
    | "deal_term_months"
    | "deal_closed_at"
    | "meeting_at"
    | "meeting_link"
    | "meeting_location"
  >
>;

export interface LeadDetail {
  lead: Lead;
  provenance: FieldProvenance[];
  history: StatusHistory[];
}

// Perfil de busca do dono (search_profile, 1 linha por owner).
export interface SearchProfile {
  owner_id: string;
  niches: string[];
  city: string | null;
  state: string | null;
  // Bairro/zona opcional pra focar a busca (ex: "Zona 7"). Em branco = cidade
  // toda. Recentra o mapa e entra no termo de busca do robo.
  neighborhood: string | null;
  radius: string;                 // "5km" | "10km" | "25km" | "50km" | "cidade"
  default_service_target: ServiceTarget;
  autopilot: boolean;
  // Profissao/vertical do usuario (catalogo em lib/professions). Define os
  // nichos sugeridos e o servico-alvo padrao no onboarding. Coluna criada por
  // migracao em outro fluxo; opcional ate todo perfil ter escolhido.
  profession?: string | null;
  created_at: string;
  updated_at: string;
}
export type SearchProfileInput = Partial<Pick<SearchProfile,
  "niches" | "city" | "state" | "neighborhood" | "radius" | "default_service_target" | "autopilot" | "profession">>;

// Cobertura de varredura por regiao/nicho (scan_coverage).
export interface ScanCoverage {
  id: string;
  owner_id: string;
  region_key: string;
  region_name: string | null;
  niche: string | null;
  center_lat: number | null;
  center_lng: number | null;
  bbox: unknown | null;
  pct: number;
  result_count: number;
  covered_at: string;
}

// Tipo de evento registrado no log de atividade.
export type ActivityType = "busca" | "enriquecimento" | "descarte" | "rascunho" | "varredura";
// Evento de atividade do dono (activity_log).
export interface ActivityEvent {
  id: string;
  owner_id: string;
  tipo: ActivityType;
  text: string;
  ref_count: number | null;
  created_at: string;
}
