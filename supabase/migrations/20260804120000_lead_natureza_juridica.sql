-- =====================================================================
-- Garimpo - natureza juridica (BrasilAPI, ja vinha na resposta e era
-- descartada). Filtro nº 1 do ICP de advocacia: MEI e pessoa com CNPJ,
-- nao contrata advogado; sociedade tem contrato social e demanda societaria.
-- =====================================================================

alter table public.leads
  add column if not exists natureza_juridica text;

comment on column public.leads.natureza_juridica is
  'Natureza juridica (BrasilAPI): "206-2 - Sociedade Empresaria Limitada", "213-5 - Empresario (Individual)", MEI etc.';
