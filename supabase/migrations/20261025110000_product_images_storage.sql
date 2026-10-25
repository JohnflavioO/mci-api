-- MCI Xpress: armazenamento de múltiplas imagens por produto.
-- A execução desta migration é necessária antes de usar upload no painel.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.has_role('admin'::public.app_role)
);

drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and public.has_role('admin'::public.app_role)
)
with check (
  bucket_id = 'product-images'
  and public.has_role('admin'::public.app_role)
);

drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and public.has_role('admin'::public.app_role)
);
