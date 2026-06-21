-- =====================================================================
-- Garimpo - carimbo de re-enriquecimento (backfill autonomo no cron)
-- O backfill processa os leads incompletos MENOS recentemente carimbados
-- primeiro (rotacao), pra varrer todos ao longo do tempo sem ficar preso nos
-- mesmos. Sem isso, ordenar por created_at travaria nos leads antigos que o
-- site nunca revela contato. Aditivo e idempotente.
-- =====================================================================

alter table public.leads add column if not exists backfilled_at timestamptz;
