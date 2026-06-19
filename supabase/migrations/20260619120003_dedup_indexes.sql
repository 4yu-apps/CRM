-- =====================================================================
-- Garimpo · Fase 0 (Fundacao) · 3/6 · INDICES + DEDUP
-- Dedup por CNPJ e telefone (criterio de aceite: nao cria lead repetido).
-- =====================================================================

-- Dedup escopado ao dono: o mesmo CNPJ/telefone nao repete na base dele.
-- Usa as colunas normalizadas (so digitos); nulos sao ignorados.
create unique index leads_owner_cnpj_uniq
  on public.leads (owner_id, cnpj_normalized)
  where cnpj_normalized is not null;

create unique index leads_owner_phone_uniq
  on public.leads (owner_id, phone_normalized)
  where phone_normalized is not null;

-- Funil / busca do dia a dia (front filtra por status).
create index leads_owner_status_idx
  on public.leads (owner_id, status);

-- Match da captacao por place_id do Maps (evita recapturar o mesmo lugar).
create index leads_maps_place_idx
  on public.leads (maps_place_id)
  where maps_place_id is not null;

-- Proveniencia: busca por lead + upsert idempotente da esteira.
create index prov_lead_idx
  on public.lead_field_provenance (lead_id);

create unique index prov_lead_field_source_uniq
  on public.lead_field_provenance (lead_id, field_name, source);

-- Historico: timeline do lead (mais recente primeiro).
create index hist_lead_idx
  on public.lead_status_history (lead_id, changed_at desc);
