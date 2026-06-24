-- =====================================================================
-- Garimpo - presets de busca (#8 da Fase 4).
-- Combinacoes nomeadas (ramos + cidade + bairro + raio + servico) que o
-- dono salva pra re-rodar com 1 clique. params em jsonb pra nao travar o
-- formato. Por-dono via RLS, espelhando o padrao das outras tabelas.
-- =====================================================================
create table if not exists public.search_presets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  name       text not null,
  params     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.search_presets is
  '#8: presets de busca por dono (ramos+cidade+bairro+raio+servico) p/ re-rodar.';

create index if not exists search_presets_owner_time_idx
  on public.search_presets (owner_id, created_at desc);

alter table public.search_presets enable row level security;

drop policy if exists search_presets_owner_all on public.search_presets;
create policy search_presets_owner_all on public.search_presets
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.search_presets to authenticated;
