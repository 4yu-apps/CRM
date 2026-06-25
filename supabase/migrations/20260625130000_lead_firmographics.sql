-- =====================================================================
-- Garimpo - firmografia gratis da BrasilAPI (ja vinha na resposta, era
-- descartada). Porte, capital social e numero de socios.
-- =====================================================================

alter table public.leads
  add column if not exists porte text,
  add column if not exists capital_social numeric,
  add column if not exists socios_count integer;

comment on column public.leads.porte is
  'Porte da empresa (BrasilAPI): MEI / ME / EPP / DEMAIS.';
comment on column public.leads.capital_social is
  'Capital social declarado (BrasilAPI), em reais.';
comment on column public.leads.socios_count is
  'Numero de socios no QSA (BrasilAPI).';
