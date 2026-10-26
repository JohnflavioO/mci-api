-- MCI Xpress: corrigir configuração do Storage para banners da página inicial.
-- Migration idempotente: cria/atualiza o bucket e reaplica as políticas esperadas.
-- Não altera registros existentes em public.homepage_hero_slides nem remove arquivos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homepage-banners',
  'homepage-banners',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view homepage banner images" on storage.objects;
create policy "Public can view homepage banner images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'homepage-banners');

drop policy if exists "Admins upload homepage banner images" on storage.objects;
create policy "Admins upload homepage banner images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'homepage-banners'
  and public.has_role('admin'::public.app_role)
);

drop policy if exists "Admins update homepage banner images" on storage.objects;
create policy "Admins update homepage banner images"
on storage.objects for update to authenticated
using (
  bucket_id = 'homepage-banners'
  and public.has_role('admin'::public.app_role)
)
with check (
  bucket_id = 'homepage-banners'
  and public.has_role('admin'::public.app_role)
);

drop policy if exists "Admins delete homepage banner images" on storage.objects;
create policy "Admins delete homepage banner images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'homepage-banners'
  and public.has_role('admin'::public.app_role)
);
