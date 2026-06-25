-- =====================================================================
-- Garimpo - indices pros filtros comuns do front (Fase 8, performance)
-- A fila/funil/contatos filtram por service_target, score, responsavel e tags.
-- Sem indice, vira seq scan conforme a base cresce. Aditivo e idempotente.
-- =====================================================================

create index if not exists leads_owner_service_target_idx
  on public.leads (owner_id, service_target);

create index if not exists leads_owner_score_idx
  on public.leads (owner_id, score desc nulls last);

create index if not exists leads_assigned_to_idx
  on public.leads (assigned_to)
  where assigned_to is not null;

create index if not exists leads_tags_gin
  on public.leads using gin (tags);
