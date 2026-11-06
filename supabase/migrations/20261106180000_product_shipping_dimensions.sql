-- Dados logísticos por produto para cotação Jamef e Correios.
begin;

alter table public.products
  add column if not exists weight_kg numeric(10,3),
  add column if not exists height_cm numeric(10,2),
  add column if not exists width_cm numeric(10,2),
  add column if not exists length_cm numeric(10,2);

do $
begin
  if not exists (select 1 from pg_constraint where conname = 'products_weight_kg_positive' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_weight_kg_positive check (weight_kg is null or weight_kg > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_height_cm_positive' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_height_cm_positive check (height_cm is null or height_cm > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_width_cm_positive' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_width_cm_positive check (width_cm is null or width_cm > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_length_cm_positive' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_length_cm_positive check (length_cm is null or length_cm > 0);
  end if;
end $;

-- Troca a RPC por uma versão que grava também os dados de embalagem.
drop function if exists public.admin_save_product(uuid,text,text,text,text,text,text,numeric,numeric,text);
create or replace function public.admin_save_product(
  p_id uuid,
  p_name text,
  p_brand text,
  p_sku text,
  p_category text,
  p_description text,
  p_status text,
  p_customer_price numeric,
  p_reseller_price numeric,
  p_image_url text,
  p_weight_kg numeric,
  p_height_cm numeric,
  p_width_cm numeric,
  p_length_cm numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.has_role('admin'::public.app_role) then
    raise exception 'Acesso administrativo obrigatório' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'Informe o nome do produto' using errcode = '22023'; end if;
  if p_status not in ('draft', 'published') then raise exception 'Status inválido' using errcode = '22023'; end if;
  if p_customer_price is not null and p_customer_price < 0 then raise exception 'Preço ao cliente inválido' using errcode = '22023'; end if;
  if p_reseller_price is not null and p_reseller_price < 0 then raise exception 'Preço de revenda inválido' using errcode = '22023'; end if;
  if p_customer_price is not null and p_reseller_price is not null and p_reseller_price > p_customer_price then raise exception 'O preço de revenda não pode ser maior que o preço ao cliente' using errcode = '22023'; end if;
  if p_image_url is not null and p_image_url !~ '^https://' then raise exception 'A imagem precisa usar HTTPS' using errcode = '22023'; end if;
  if p_weight_kg is not null and p_weight_kg <= 0 then raise exception 'Peso deve ser maior que zero' using errcode = '22023'; end if;
  if p_height_cm is not null and p_height_cm <= 0 then raise exception 'Altura deve ser maior que zero' using errcode = '22023'; end if;
  if p_width_cm is not null and p_width_cm <= 0 then raise exception 'Largura deve ser maior que zero' using errcode = '22023'; end if;
  if p_length_cm is not null and p_length_cm <= 0 then raise exception 'Comprimento deve ser maior que zero' using errcode = '22023'; end if;

  if p_id is null then
    insert into public.products(name, brand, sku, category, description, status, weight_kg, height_cm, width_cm, length_cm)
    values (btrim(p_name), coalesce(btrim(p_brand), ''), nullif(btrim(p_sku), ''), nullif(btrim(p_category), ''), nullif(btrim(p_description), ''), p_status::public.product_status, p_weight_kg, p_height_cm, p_width_cm, p_length_cm)
    returning id into v_id;
  else
    update public.products set name = btrim(p_name), brand = coalesce(btrim(p_brand), ''), sku = nullif(btrim(p_sku), ''),
      category = nullif(btrim(p_category), ''), description = nullif(btrim(p_description), ''), status = p_status::public.product_status,
      weight_kg = p_weight_kg, height_cm = p_height_cm, width_cm = p_width_cm, length_cm = p_length_cm,
      row_version = row_version + 1, updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Produto não encontrado' using errcode = 'P0002'; end if;
  end if;

  insert into public.product_prices(product_id, currency, customer_price, updated_at)
  values (v_id, 'BRL', p_customer_price, now())
  on conflict (product_id) do update set customer_price = excluded.customer_price, updated_at = now();
  insert into public.product_reseller_prices(product_id, reseller_price, updated_at)
  values (v_id, p_reseller_price, now())
  on conflict (product_id) do update set reseller_price = excluded.reseller_price, updated_at = now();

  delete from public.product_images where product_id = v_id;
  if p_image_url is not null and btrim(p_image_url) <> '' then
    insert into public.product_images(product_id, url, position) values (v_id, btrim(p_image_url), 0);
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_save_product(uuid,text,text,text,text,text,text,numeric,numeric,text,numeric,numeric,numeric,numeric) from public, anon;
grant execute on function public.admin_save_product(uuid,text,text,text,text,text,text,numeric,numeric,text,numeric,numeric,numeric,numeric) to authenticated;

commit;
