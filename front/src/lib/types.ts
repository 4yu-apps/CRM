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

// score_reason (jsonb) — score explicavel (criterio de aceite da Fase 3,
// ja tipado aqui para o front exibir o "por que pontuou X").
export interface ScoreReason {
  total: number;
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

  opt_out: boolean;
  opt_out_at: string | null;

  archived: boolean;

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
  >
>;

export interface LeadDetail {
  lead: Lead;
  provenance: FieldProvenance[];
  history: StatusHistory[];
}
