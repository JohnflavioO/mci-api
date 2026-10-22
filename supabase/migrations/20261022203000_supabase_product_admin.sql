-- MCI Xpress: catálogo administrativo usando Supabase (sem dependência da API Node/Oracle).
-- A tabela public.user_roles e a função public.has_role(_role app_role) já existem.

begin;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  brand text not null default '' check (length(brand) <= 100),
  sku text,
  category text,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists products_sku_ci_uq
  on public.products (upper(btrim(sku))) where sku is not null and btrim(sku) <> '';
create index if not exists products_status_name_idx on public.products(status, name);

create table if not exists public.product_prices (
  product_id uuid primary key references public.products(id) on delete cascade,
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  customer_price numeric(12,2) check (customer_price is null or customer_price >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.product_reseller_prices (
  product_id uuid primary key references public.products(id) on delete cascade,
  reseller_price numeric(12,2) check (reseller_price is null or reseller_price >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.product_specs (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null,
  value text not null
);
create table if not exists public.product_images (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null check (url ~ '^https://' and length(url) <= 2048),
  position integer not null default 0 check (position >= 0),
  unique(product_id, position)
);

alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.product_reseller_prices enable row level security;
alter table public.product_specs enable row level security;
alter table public.product_images enable row level security;

grant select on public.products, public.product_prices, public.product_specs, public.product_images to anon, authenticated;
grant insert, update, delete on public.products, public.product_prices, public.product_specs, public.product_images to authenticated;
grant select, insert, update, delete on public.product_reseller_prices to authenticated;
grant all on public.products, public.product_prices, public.product_reseller_prices, public.product_specs, public.product_images to service_role;

drop policy if exists "mci public reads published products" on public.products;
create policy "mci public reads published products" on public.products for select to anon, authenticated using (status = 'published');
drop policy if exists "mci admin manages products" on public.products;
create policy "mci admin manages products" on public.products for all to authenticated
  using (public.has_role('admin'::public.app_role)) with check (public.has_role('admin'::public.app_role));

drop policy if exists "mci public reads published prices" on public.product_prices;
create policy "mci public reads published prices" on public.product_prices for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
drop policy if exists "mci admin manages prices" on public.product_prices;
create policy "mci admin manages prices" on public.product_prices for all to authenticated
  using (public.has_role('admin'::public.app_role)) with check (public.has_role('admin'::public.app_role));

drop policy if exists "mci admin manages reseller prices" on public.product_reseller_prices;
create policy "mci admin manages reseller prices" on public.product_reseller_prices for all to authenticated
  using (public.has_role('admin'::public.app_role)) with check (public.has_role('admin'::public.app_role));

drop policy if exists "mci public reads published specs" on public.product_specs;
create policy "mci public reads published specs" on public.product_specs for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
drop policy if exists "mci admin manages specs" on public.product_specs;
create policy "mci admin manages specs" on public.product_specs for all to authenticated
  using (public.has_role('admin'::public.app_role)) with check (public.has_role('admin'::public.app_role));

drop policy if exists "mci public reads published images" on public.product_images;
create policy "mci public reads published images" on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
drop policy if exists "mci admin manages images" on public.product_images;
create policy "mci admin manages images" on public.product_images for all to authenticated
  using (public.has_role('admin'::public.app_role)) with check (public.has_role('admin'::public.app_role));

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
  p_image_url text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.has_role('admin'::public.app_role) then
    raise exception 'Acesso administrativo obrigatório' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Informe o nome do produto' using errcode = '22023';
  end if;
  if p_status not in ('draft', 'published') then
    raise exception 'Status inválido' using errcode = '22023';
  end if;
  if p_customer_price is not null and p_customer_price < 0 then
    raise exception 'Preço ao cliente inválido' using errcode = '22023';
  end if;
  if p_reseller_price is not null and p_reseller_price < 0 then
    raise exception 'Preço de revenda inválido' using errcode = '22023';
  end if;
  if p_customer_price is not null and p_reseller_price is not null and p_reseller_price > p_customer_price then
    raise exception 'O preço de revenda não pode ser maior que o preço ao cliente' using errcode = '22023';
  end if;
  if p_image_url is not null and p_image_url !~ '^https://' then
    raise exception 'A imagem precisa usar HTTPS' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.products(name, brand, sku, category, description, status)
    values (btrim(p_name), coalesce(btrim(p_brand), ''), nullif(btrim(p_sku), ''),
      nullif(btrim(p_category), ''), nullif(btrim(p_description), ''), p_status)
    returning id into v_id;
  else
    update public.products set name = btrim(p_name), brand = coalesce(btrim(p_brand), ''),
      sku = nullif(btrim(p_sku), ''), category = nullif(btrim(p_category), ''),
      description = nullif(btrim(p_description), ''), status = p_status,
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

revoke all on function public.admin_save_product(uuid,text,text,text,text,text,text,numeric,numeric,text) from public, anon;
grant execute on function public.admin_save_product(uuid,text,text,text,text,text,text,numeric,numeric,text) to authenticated;

commit;
