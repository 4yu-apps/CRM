-- Bucket de avatares dos usuarios.
--
-- Publico: avatar nao e dado sensivel e a URL publica vai direto no <img> do
-- app-shell, sem precisar de signed URL. A ESCRITA e restrita: cada usuario so
-- mexe nos objetos sob a propria pasta {uid}/ (checado por auth.uid()). Assim
-- ninguem sobrescreve a foto de outro. Leitura aberta.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Idempotente: dropa antes de recriar pra o migration poder ser reaplicado.
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;

-- Leitura publica dos avatares.
create policy "avatars_public_read"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- Upload so na propria pasta {uid}/.
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update (usado no upsert) so na propria pasta.
create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete so na propria pasta.
create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
