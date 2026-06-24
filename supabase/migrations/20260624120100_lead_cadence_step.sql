-- =====================================================================
-- Garimpo - cadencia multi-toque leve (#2 da Fase 2).
-- cadence_step: em que toque da regua o lead esta (0 = sem regua;
-- 1..3 = toques ja dados). A data do PROXIMO toque reusa followup_at,
-- entao nao precisa de tabela nova: ao concluir um toque, o front
-- avanca o step e reagenda o followup_at. Continua manual (so lembra).
-- =====================================================================
alter table public.leads
  add column if not exists cadence_step int not null default 0;
