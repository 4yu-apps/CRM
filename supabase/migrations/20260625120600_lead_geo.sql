-- =====================================================================
-- Garimpo - geo & dedup cross-fonte (Fase 7)
-- lat/lng (Places e OSM ja retornam, antes jogados fora) habilitam mapa de leads
-- e dedup por proximidade. opening_hours (gratis do OSM) e base pro "melhor
-- horario". geo_dedup_key (nome normalizado + coord ~111m) deduplica o MESMO
-- negocio achado por fontes diferentes (Places place_id != OSM osm:id, e o
-- name_addr diverge por formato de endereco). Aditivo e idempotente.
-- =====================================================================

alter table public.leads
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists opening_hours text;

-- chave de dedup geografica: so quando ha nome + coordenada. round(.,3) ~= 111m.
alter table public.leads
  add column if not exists geo_dedup_key text
    generated always as (
      case
        when lat is not null and lng is not null and business_name is not null then
          btrim(lower(regexp_replace(business_name, '\s+', ' ', 'g')))
          || '|' || round(lat::numeric, 3)::text
          || '|' || round(lng::numeric, 3)::text
        else null
      end
    ) stored;

create unique index if not exists leads_owner_geo_uniq
  on public.leads (owner_id, geo_dedup_key)
  where geo_dedup_key is not null;
