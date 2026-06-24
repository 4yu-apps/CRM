-- =====================================================================
-- Garimpo - biblioteca de templates de mensagem (#18 da Fase 7).
-- Modelos reutilizaveis (abertura, follow-up, objecao, reativacao) com
-- variaveis {nome}/{ramo}/{bairro}/{cidade}. Por-dono via RLS.
-- =====================================================================
create table if not exists public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  name       text not null,
  body       text not null,
  kind       text not null default 'abertura',   -- abertura|follow_up|objecao|reativacao
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.message_templates is
  '#18: modelos de mensagem por dono, com variaveis substituiveis.';

create index if not exists message_templates_owner_idx
  on public.message_templates (owner_id, created_at desc);

drop trigger if exists message_templates_set_updated_at on public.message_templates;
create trigger message_templates_set_updated_at
  before update on public.message_templates
  for each row execute function public.tg_set_updated_at();

alter table public.message_templates enable row level security;

drop policy if exists message_templates_owner_all on public.message_templates;
create policy message_templates_owner_all on public.message_templates
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.message_templates to authenticated;
