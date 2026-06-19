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
  email: string | null;
  instagram: string | null;
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

  created_at: string;
  updated_at: string;

  // Rascunho (Fase 3 — tabela propria depois). No front ja existe para o
  // fluxo de aprovacao "ver -> editar -> aprovar".
  draft_msg1?: string | null;
  draft_msg2?: string | null;
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
    | "email"
    | "instagram"
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
  >
>;

export interface LeadDetail {
  lead: Lead;
  provenance: FieldProvenance[];
  history: StatusHistory[];
}
