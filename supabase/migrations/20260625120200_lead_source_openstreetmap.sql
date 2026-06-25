-- =====================================================================
-- Garimpo - fonte openstreetmap no enum lead_source (O2 descoberta Overpass)
-- A descoberta via OpenStreetMap/Overpass (gratis, sem chave) grava proveniencia
-- por campo como 'openstreetmap'. Sem isso, record_provenance recusaria o valor.
-- Aditivo e idempotente.
-- =====================================================================

alter type public.lead_source add value if not exists 'openstreetmap';
