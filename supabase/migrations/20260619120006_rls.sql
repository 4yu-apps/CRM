-- =====================================================================
-- Garimpo · Fase 0 (Fundacao) · 6/6 · RLS + GRANTS
-- Row Level Security: so o dono enxerga/mexe no que e dele.
-- A esteira usa service_role (bypassa RLS). Front/extensao usam o usuario
-- logado (auth.uid()). Grants explicitos (Data API nao auto-expoe).
-- =====================================================================

alter table public.leads                  enable row level security;
alter table public.lead_field_provenance  enable row level security;
alter table public.lead_status_history    enable row level security;
alter table public.lead_status_transitions enable row level security;

-- ---------------------------------------------------------------------
-- LEADS — dono ve/edita/apaga so os proprios (LGPD: delete liberado)
-- ---------------------------------------------------------------------
create policy leads_owner_all on public.leads
  for all
  to authenticated
  using      (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- PROVENIENCIA — segue o dono do lead
-- ---------------------------------------------------------------------
create policy prov_owner_all on public.lead_field_provenance
  for all
  to authenticated
  using (exists (
    select 1 from public.leads l
    where l.id = lead_id and l.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.leads l
    where l.id = lead_id and l.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------
-- HISTORICO — leitura e insercao do dono; sem update/delete (imutavel)
-- ---------------------------------------------------------------------
create policy hist_owner_select on public.lead_status_history
  for select
  to authenticated
  using (exists (
    select 1 from public.leads l
    where l.id = lead_id and l.owner_id = auth.uid()
  ));

create policy hist_owner_insert on public.lead_status_history
  for insert
  to authenticated
  with check (exists (
    select 1 from public.leads l
    where l.id = lead_id and l.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------
-- TRANSICOES — tabela de regras: leitura para todos; sem escrita via API
-- ---------------------------------------------------------------------
create policy trans_read on public.lead_status_transitions
  for select
  to authenticated, anon
  using (true);

-- ---------------------------------------------------------------------
-- GRANTS — Data API nao auto-expoe entidades novas; conceder explicito.
-- service_role ja tem acesso amplo por padrao no Supabase.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.leads                 to authenticated;
grant select, insert, update, delete on public.lead_field_provenance to authenticated;
grant select, insert                 on public.lead_status_history    to authenticated;
grant select                         on public.lead_status_transitions to authenticated, anon;

grant execute on function
  public.transition_lead(uuid, public.lead_status, public.actor_type, text)
  to authenticated;
