-- =====================================================================
-- Garimpo · B2 (perfil + dedup nome/endereco) + B3 (cobertura) + B4 (feed)
-- Tres tabelas por-dono (multi-tenant via RLS) que destravam Config (C8),
-- Buscar/mapa (C4) e Inicio/feed (C1). Tudo aditivo e idempotente.
-- Espelha o padrao da Fase 0: RLS owner = auth.uid(), grants explicitos,
-- updated_at por trigger (tg_set_updated_at ja existe na migration 5).
-- =====================================================================

-- ---------------------------------------------------------------------
-- B2 · search_profile — um perfil de busca por dono (autopilot da esteira)
-- ---------------------------------------------------------------------
create table if not exists public.search_profile (
  owner_id  uuid primary key default auth.uid()
              references auth.users (id) on delete cascade,
  niches    text[] not null default '{}',          -- ramos escolhidos (chips)
  city      text,
  state     text,                                   -- UF
  radius    text not null default '10km',           -- raio de atuacao (5/10/25/50km/cidade)
  default_service_target public.service_target not null default 'indefinido',
  autopilot boolean not null default false,         -- busca no piloto automatico
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.search_profile is
  'B2: perfil de busca por dono. A esteira itera os perfis com autopilot on.';

drop trigger if exists search_profile_set_updated_at on public.search_profile;
create trigger search_profile_set_updated_at
  before update on public.search_profile
  for each row execute function public.tg_set_updated_at();

-- B2 · 4a chave de dedup: nome + endereco normalizados (escopado ao dono).
-- Captacao do Maps as vezes nao traz telefone/CNPJ; nome+endereco ancora.
alter table public.leads
  add column if not exists name_addr_normalized text
    generated always as (
      nullif(
        btrim(lower(regexp_replace(
          coalesce(business_name, '') || ' ' || coalesce(address, ''),
          '\s+', ' ', 'g'
        ))),
      '')
    ) stored;

create unique index if not exists leads_owner_name_addr_uniq
  on public.leads (owner_id, name_addr_normalized)
  where name_addr_normalized is not null;

-- ---------------------------------------------------------------------
-- B3 · scan_coverage — cobertura por zona (alimenta o mapa da Buscar)
-- ---------------------------------------------------------------------
create table if not exists public.scan_coverage (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  region_key   text not null,                 -- chave estavel da zona (bairro/grid)
  region_name  text,                          -- nome legivel
  niche        text,                          -- ramo varrido
  center_lat   numeric(9,6),
  center_lng   numeric(9,6),
  bbox         jsonb,                          -- caixa da zona (opcional)
  pct          integer not null default 0,    -- 0..100 de cobertura
  result_count integer not null default 0,
  covered_at   timestamptz not null default now(),

  constraint scan_coverage_pct_range check (pct between 0 and 100),
  constraint scan_coverage_count_nonneg check (result_count >= 0)
);

comment on table public.scan_coverage is
  'B3: cobertura por zona/ramo. Orquestracao da busca le/grava; mapa da C4 mostra.';

create unique index if not exists scan_coverage_owner_region_niche_uniq
  on public.scan_coverage (owner_id, region_key, niche);
create index if not exists scan_coverage_owner_niche_idx
  on public.scan_coverage (owner_id, niche);

-- ---------------------------------------------------------------------
-- B4 · activity_log — feed "o que rolou enquanto voce nao tava"
-- ---------------------------------------------------------------------
do $$ begin
  create type public.activity_type as enum
    ('busca', 'enriquecimento', 'descarte', 'rascunho', 'varredura');
exception when duplicate_object then null; end $$;

create table if not exists public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  tipo       public.activity_type not null,
  text       text not null,
  ref_count  integer,
  created_at timestamptz not null default now()
);

comment on table public.activity_log is
  'B4: eventos da esteira por dono. Front le os ultimos N pro Inicio (C1).';

create index if not exists activity_log_owner_time_idx
  on public.activity_log (owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS + GRANTS (so o dono enxerga/mexe; esteira usa service_role)
-- ---------------------------------------------------------------------
alter table public.search_profile enable row level security;
alter table public.scan_coverage  enable row level security;
alter table public.activity_log   enable row level security;

drop policy if exists search_profile_owner_all on public.search_profile;
create policy search_profile_owner_all on public.search_profile
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists scan_coverage_owner_all on public.scan_coverage;
create policy scan_coverage_owner_all on public.scan_coverage
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- feed e append-only pro dono: le e insere, sem update/delete via API
drop policy if exists activity_log_owner_select on public.activity_log;
create policy activity_log_owner_select on public.activity_log
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists activity_log_owner_insert on public.activity_log;
create policy activity_log_owner_insert on public.activity_log
  for insert to authenticated with check (owner_id = auth.uid());

grant select, insert, update, delete on public.search_profile to authenticated;
grant select, insert, update, delete on public.scan_coverage  to authenticated;
grant select, insert                 on public.activity_log   to authenticated;
