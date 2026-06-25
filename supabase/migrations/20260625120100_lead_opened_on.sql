-- =====================================================================
-- Garimpo - data de abertura da empresa (O1 "negocio novo")
-- Vem da BrasilAPI (data_inicio_atividade) no enriquecimento de CNPJ. Negocio
-- aberto ha pouco quase sempre precisa montar presenca (site/redes/trafego), so
-- o score (lente trafego/design/marketing) ja usa esse sinal e o breakdown o
-- mostra de graca. Aditivo e idempotente; backfill popula os leads antigos.
-- =====================================================================

alter table public.leads
  add column if not exists opened_on date;

comment on column public.leads.opened_on is
  'Data de abertura da empresa (data_inicio_atividade da BrasilAPI). Alimenta o criterio "negocio novo".';
