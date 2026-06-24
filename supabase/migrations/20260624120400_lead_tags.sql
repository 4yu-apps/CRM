-- =====================================================================
-- Garimpo - tags manuais nos leads (#20 da Fase 7).
-- Etiquetas livres ("indicacao", "VIP", "evento X") pra segmentar.
-- Array de texto, default vazio. RLS dos leads ja cobre o acesso.
-- =====================================================================
alter table public.leads
  add column if not exists tags text[] not null default '{}';

create index if not exists leads_tags_gin on public.leads using gin (tags);
