-- =====================================================================
-- Garimpo · Fase 2 (captacao) · DEDUP por place_id do Maps
-- A captacao insere leads sem telefone/CNPJ (que so o enriquecimento traz).
-- Sem isto, re-rodar a descoberta duplicaria o mesmo lugar. Dedup pelo
-- place_id do Maps, escopado ao dono.
-- =====================================================================

create unique index if not exists leads_owner_place_uniq
  on public.leads (owner_id, maps_place_id)
  where maps_place_id is not null;
