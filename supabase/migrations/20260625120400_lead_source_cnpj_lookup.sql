-- =====================================================================
-- Garimpo - fonte cnpj_lookup no enum lead_source (Fase 5.5)
-- CNPJ achado por nome (lookup reverso num agregador, com validacao cruzada)
-- grava proveniencia 'cnpj_lookup' no campo cnpj. Sem isso, record_provenance
-- recusaria o valor. Aditivo e idempotente.
-- =====================================================================

alter type public.lead_source add value if not exists 'cnpj_lookup';
