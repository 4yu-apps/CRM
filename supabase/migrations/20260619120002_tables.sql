-- =====================================================================
-- Garimpo · Fase 0 (Fundacao) · 2/6 · TABELAS
-- leads (fonte da verdade) + proveniencia por campo + historico de status.
-- =====================================================================

-- ---------------------------------------------------------------------
-- LEADS — o registro central. Tudo passa por aqui.
-- ---------------------------------------------------------------------
create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  -- dono do dado (RLS): por padrao o usuario logado (front/extensao).
  -- A esteira (service_role) precisa passar owner_id explicito.
  owner_id      uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,

  status        public.lead_status not null default 'bruto',

  -- identidade do negocio
  business_name text,
  cnpj          text,
  phone         text,
  email         text,
  instagram     text,
  website       text,

  -- descoberta (Google Maps)
  maps_place_id text,
  maps_url      text,
  rating        numeric(2,1),       -- 0.0 .. 5.0
  reviews_count integer,
  category      text,               -- segmento / ramo
  address       text,
  neighborhood  text,
  city          text,
  state         text,               -- UF

  -- enriquecimento (CNPJ publico)
  owner_name    text,               -- nome do socio / responsavel

  -- qualificacao (score contra o ICP)
  score         integer,
  score_reason  jsonb,              -- explicavel: por que pontuou X

  -- LGPD (desde o schema — principio 4 do mapa)
  opt_out       boolean not null default false,
  opt_out_at    timestamptz,

  -- chaves normalizadas para dedup (so digitos; vazio -> null)
  cnpj_normalized  text generated always as
    (nullif(regexp_replace(coalesce(cnpj,  ''), '\D', '', 'g'), '')) stored,
  phone_normalized text generated always as
    (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint leads_rating_range
    check (rating is null or (rating >= 0 and rating <= 5)),
  constraint leads_reviews_nonneg
    check (reviews_count is null or reviews_count >= 0)
);

comment on table  public.leads is 'Fonte da verdade dos leads. Espinha do funil (secao 3 do mapa).';
comment on column public.leads.owner_id     is 'Dono do dado para RLS. Default auth.uid(); esteira passa explicito.';
comment on column public.leads.score_reason is 'JSON explicavel: criterios e pesos que geraram o score.';
comment on column public.leads.opt_out      is 'LGPD: true = nao contatar. Bloqueia transicao para rascunho/aprovado/enviado.';

-- ---------------------------------------------------------------------
-- PROVENIENCIA POR CAMPO — qual fonte achou cada dado, e o que disse.
-- Diferencia o Garimpo de "uma planilha bonita" (principio 3).
-- ---------------------------------------------------------------------
create table public.lead_field_provenance (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  field_name text not null,               -- ex.: 'phone', 'instagram', 'owner_name'
  source     public.lead_source not null, -- quem achou
  value      text,                        -- o que essa fonte disse
  confidence numeric(3,2),                -- 0..1 opcional (match rate do campo)
  found_at   timestamptz not null default now(),

  constraint prov_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

comment on table public.lead_field_provenance is
  'Proveniencia campo-a-campo. Re-enriquecer faz upsert (idempotente) via (lead_id, field_name, source).';

-- ---------------------------------------------------------------------
-- HISTORICO DE STATUS — auditoria do funil (carimbo de data/hora).
-- Preenchido automaticamente por trigger (migration 5).
-- ---------------------------------------------------------------------
create table public.lead_status_history (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  from_status public.lead_status,                    -- null no registro inicial
  to_status   public.lead_status not null,
  actor       public.actor_type not null default 'system',
  changed_by  uuid references auth.users (id),       -- auth.uid() quando humano
  note        text,
  changed_at  timestamptz not null default now()
);

comment on table public.lead_status_history is
  'Auditoria imutavel das mudancas de status. Sem update/delete via API (so RLS de leitura/insercao).';
