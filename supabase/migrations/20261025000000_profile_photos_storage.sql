-- MCI Xpress: armazenamento de fotos de perfil do portal do revendedor
-- Aplicar no SQL Editor do projeto Supabase correto antes de testar o upload.
-- Fotos são públicas para permitir exibição do avatar via getPublicUrl.
-- Escrita fica restrita à pasta cujo nome é o UUID do próprio usuário.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile photos: owner can upload" on storage.objects;
create policy "Profile photos: owner can upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Profile photos: owner can update" on storage.objects;
create policy "Profile photos: owner can update"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Profile photos: owner can delete" on storage.objects;
create policy "Profile photos: owner can delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- A leitura dos arquivos é pública porque o bucket é público; upload/alteração/exclusão
-- continuam limitados à pasta do próprio usuário.
