-- =====================================================================
-- Garimpo - carimbo de reprocessamento (Parte 2). Permite ondas resumíveis:
-- cada onda pega os leads com reprocessed_at mais antigo (NULL primeiro), re-
-- enriquece e re-scora SEM mudar o status. Separado do backfilled_at (rotina
-- diferente). Aditivo e idempotente.
-- =====================================================================

alter table public.leads
  add column if not exists reprocessed_at timestamptz;

create index if not exists idx_leads_reprocessed_at
  on public.leads (reprocessed_at asc nulls first);

comment on column public.leads.reprocessed_at is
  'Ultima vez que o lead passou pelo reprocessamento (re-enrich + re-score sem mudar status). NULL = nunca reprocessado.';
