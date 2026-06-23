-- =====================================================================
-- Garimpo - anexos por lead (ex: contrato) em bucket PRIVADO.
-- Seguranca: nada publico. O path e sempre <owner_id>/<lead_id>/<arquivo>,
-- e cada dono so le/grava/apaga arquivos sob a propria pasta (1o segmento do
-- path = auth.uid()). O app baixa por URL assinada e curta (60s).
-- Aditivo e idempotente.
-- =====================================================================

-- Bucket privado, com teto de 25 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('lead-anexos', 'lead-anexos', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

-- Politicas em storage.objects, escopadas ao bucket e a pasta do proprio dono.
drop policy if exists "anexos_select_own" on storage.objects;
create policy "anexos_select_own" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lead-anexos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "anexos_insert_own" on storage.objects;
create policy "anexos_insert_own" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'lead-anexos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "anexos_update_own" on storage.objects;
create policy "anexos_update_own" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'lead-anexos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'lead-anexos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "anexos_delete_own" on storage.objects;
create policy "anexos_delete_own" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lead-anexos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
