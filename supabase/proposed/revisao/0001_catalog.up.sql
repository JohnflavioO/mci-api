-- MCI Xpress — migration 0001: catálogo, papéis e RLS.
-- PROPOSTA REVISADA (v2): NÃO EXECUTADA. Aguarda aprovação.
-- Regras vindas do código atual (adminProducts.ts, catalog.ts, productImport.ts):
--   status só 'draft' | 'published'; SKU único (sem diferenciar maiúsculas);
--   preços BRL >= 0, revenda <= cliente; publicar exige SKU, categoria, >=1 imagem
--   e os dois preços > 0; specs com rótulo único (sem diferenciar maiúsculas), até 100;
--   imagens https, posição única, até 20; row_version para conflitos de edição;
--   preço de revenda nunca público; duplicidade na importação por URL de origem ou SKU.

begin;

-- 1. Papéis ---------------------------------------------------------------
create type public.app_role as enum ('admin', 'revendedor', 'afiliado');
create type public.product_status as enum ('draft', 'published');

create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- Função SECURITY DEFINER: evita recursão de RLS e não depende do cliente.
-- Só consulta o papel do PRÓPRIO usuário (auth.uid()): impede sondar papéis de terceiros.
create or replace function public.has_role(_role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = _role)
$$;
revoke all on function public.has_role(public.app_role) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated, service_role;

-- Cada usuário só vê os próprios papéis; ninguém concede papéis pelo navegador
-- (sem políticas de INSERT/UPDATE/DELETE: só service_role ou SQL no painel).
create policy "own roles readable" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

-- 2. Produtos -------------------------------------------------------------
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 200),
  brand           text not null default '' check (length(brand) <= 100),
  sku             text check (sku is null or length(btrim(sku)) between 1 and 64),
  sku_normalized  text generated always as (upper(btrim(sku))) stored,
  category        text check (category is null or length(btrim(category)) between 1 and 100),
  description     text check (description is null or length(description) <= 20000),
  status          public.product_status not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 1 check (row_version >= 1)
);
create unique index products_sku_normalized_uq on public.products (sku_normalized) where sku_normalized is not null;
create index products_status_updated_idx on public.products (status, updated_at desc);
create index products_category_idx on public.products (category) where status = 'published';

-- 2b. Metadados só de admin (origem da importação e autoria): fora da tabela pública,
-- porque GRANT de SELECT vale para todas as colunas e o RLS não esconde colunas.
create table public.product_admin_meta (
  product_id  uuid primary key references public.products(id) on delete cascade,
  source_url  text check (source_url is null or (source_url ~ '^https?://' and length(source_url) <= 2048)),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null
);
create unique index product_admin_meta_source_url_uq on public.product_admin_meta (source_url) where source_url is not null;

-- 3. Preços: separados para que o preço de revenda fique em tabela só de admin.
create table public.product_prices (
  product_id     uuid primary key references public.products(id) on delete cascade,
  currency       char(3) not null default 'BRL' check (currency = 'BRL'),
  customer_price numeric(12,2) check (customer_price is null or customer_price >= 0),
  updated_at     timestamptz not null default now(),
  row_version    integer not null default 1
);
create table public.product_reseller_prices (
  product_id     uuid primary key references public.products(id) on delete cascade,
  reseller_price numeric(12,2) check (reseller_price is null or reseller_price >= 0),
  updated_at     timestamptz not null default now(),
  row_version    integer not null default 1
);

-- 4. Especificações e imagens ---------------------------------------------
create table public.product_specs (
  id         bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  label      text not null check (length(btrim(label)) between 1 and 100),
  value      text not null check (length(btrim(value)) between 1 and 500)
);
create unique index product_specs_label_uq on public.product_specs (product_id, lower(btrim(label)));

create table public.product_images (
  id         bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  url        text not null check (url ~ '^https://' and length(url) <= 2048),
  position   integer not null check (position >= 0),
  unique (product_id, position)
);

-- 5. Regras automáticas ---------------------------------------------------
create or replace function public.tg_bump_version() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end $$;
create trigger products_bump before update on public.products for each row execute function public.tg_bump_version();
create trigger prices_bump before update on public.product_prices for each row execute function public.tg_bump_version();
create trigger reseller_bump before update on public.product_reseller_prices for each row execute function public.tg_bump_version();

-- Autoria gravada pelo banco (não aceita valor enviado pelo cliente).
create or replace function public.tg_products_meta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.product_admin_meta (product_id, created_by, updated_by) values (new.id, auth.uid(), auth.uid())
    on conflict (product_id) do update set created_by = excluded.created_by, updated_by = excluded.updated_by;
  else
    update public.product_admin_meta set updated_by = auth.uid() where product_id = new.id;
  end if;
  return null;
end $$;
create trigger products_meta after insert or update on public.products for each row execute function public.tg_products_meta();

create or replace function public.tg_meta_authorship() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; end if;
  if current_user <> 'service_role' and pg_trigger_depth() = 1 then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
create trigger meta_authorship before insert or update on public.product_admin_meta for each row execute function public.tg_meta_authorship();

-- Filhos não podem trocar de produto (contornaria limites e publicação).
create or replace function public.tg_freeze_product_id() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.product_id <> old.product_id then
    raise exception 'product_id não pode ser alterado' using errcode = 'check_violation'; end if;
  return new;
end $$;
create trigger specs_freeze before update of product_id on public.product_specs for each row execute function public.tg_freeze_product_id();
create trigger images_freeze before update of product_id on public.product_images for each row execute function public.tg_freeze_product_id();

-- Limites de quantidade (100 specs / 20 imagens) e revenda <= cliente.
create or replace function public.tg_check_children() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id); c numeric; r numeric;
begin
  -- Trava a linha do produto: serializa gravações concorrentes nos filhos e na publicação.
  perform 1 from public.products where id = pid for update;
  if (select count(*) from public.product_specs where product_id = pid) > 100 then
    raise exception 'Máximo de 100 especificações' using errcode = 'check_violation'; end if;
  if (select count(*) from public.product_images where product_id = pid) > 20 then
    raise exception 'Máximo de 20 imagens' using errcode = 'check_violation'; end if;
  select customer_price into c from public.product_prices where product_id = pid;
  select reseller_price into r from public.product_reseller_prices where product_id = pid;
  if c is not null and r is not null and r > c then
    raise exception 'Preço de revenda maior que o preço ao cliente' using errcode = 'check_violation'; end if;
  return null;
end $$;

-- Publicado precisa estar completo. Verificado no fim da transação (DEFERRABLE),
-- para permitir gravar produto + filhos juntos.
create or replace function public.tg_check_publishable() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id); p public.products; missing text[] := '{}';
begin
  select * into p from public.products where id = pid;
  if p.id is null or p.status <> 'published' then return null; end if;
  if p.sku is null then missing := array_append(missing, 'sku'); end if;
  if p.category is null then missing := array_append(missing, 'category'); end if;
  if not exists (select 1 from public.product_images where product_id = pid) then missing := array_append(missing, 'images'); end if;
  if not exists (select 1 from public.product_prices where product_id = pid and customer_price > 0) then missing := array_append(missing, 'customerPrice'); end if;
  if not exists (select 1 from public.product_reseller_prices where product_id = pid and reseller_price > 0) then missing := array_append(missing, 'resellerPrice'); end if;
  if array_length(missing, 1) > 0 then
    raise exception 'Produto publicado incompleto: %', array_to_string(missing, ', ') using errcode = 'check_violation'; end if;
  return null;
end $$;

-- products não tem product_id: wrapper que reaproveita a mesma checagem.
create or replace function public.tg_check_publishable_product() returns trigger
language plpgsql security definer set search_path = public as $$
declare missing text[] := '{}';
begin
  if new.status <> 'published' then return null; end if;
  if new.sku is null then missing := array_append(missing, 'sku'); end if;
  if new.category is null then missing := array_append(missing, 'category'); end if;
  if not exists (select 1 from public.product_images where product_id = new.id) then missing := array_append(missing, 'images'); end if;
  if not exists (select 1 from public.product_prices where product_id = new.id and customer_price > 0) then missing := array_append(missing, 'customerPrice'); end if;
  if not exists (select 1 from public.product_reseller_prices where product_id = new.id and reseller_price > 0) then missing := array_append(missing, 'resellerPrice'); end if;
  if array_length(missing, 1) > 0 then
    raise exception 'Produto publicado incompleto: %', array_to_string(missing, ', ') using errcode = 'check_violation'; end if;
  return null;
end $$;

create constraint trigger products_publishable after insert or update on public.products
  deferrable initially deferred for each row execute function public.tg_check_publishable_product();
create constraint trigger images_publishable after insert or update or delete on public.product_images
  deferrable initially deferred for each row execute function public.tg_check_publishable();
create constraint trigger prices_publishable after insert or update or delete on public.product_prices
  deferrable initially deferred for each row execute function public.tg_check_publishable();
create constraint trigger reseller_publishable after insert or update or delete on public.product_reseller_prices
  deferrable initially deferred for each row execute function public.tg_check_publishable();

create trigger specs_limits after insert or update or delete on public.product_specs for each row execute function public.tg_check_children();
create trigger images_limits after insert or update or delete on public.product_images for each row execute function public.tg_check_children();
create trigger prices_limits after insert or update on public.product_prices for each row execute function public.tg_check_children();
create trigger reseller_limits after insert or update on public.product_reseller_prices for each row execute function public.tg_check_children();

-- 6. Permissões (GRANT) — sempre antes do RLS ------------------------------
grant select on public.products, public.product_prices, public.product_specs, public.product_images to anon, authenticated;
grant insert, update, delete on public.products, public.product_prices, public.product_specs, public.product_images to authenticated;
grant select, insert, update, delete on public.product_reseller_prices to authenticated; -- RLS restringe a admin
grant select, insert, update, delete on public.product_admin_meta to authenticated; -- RLS restringe a admin
grant all on public.product_admin_meta to service_role;
grant all on public.products, public.product_prices, public.product_reseller_prices, public.product_specs, public.product_images to service_role;
-- anon NUNCA recebe acesso a product_reseller_prices.

alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.product_reseller_prices enable row level security;
alter table public.product_admin_meta enable row level security;
alter table public.product_specs enable row level security;
alter table public.product_images enable row level security;

-- 7. Políticas RLS ----------------------------------------------------------
-- Leitura pública: somente publicados.
create policy "public reads published products" on public.products
  for select to anon, authenticated using (status = 'published');
create policy "public reads published prices" on public.product_prices
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy "public reads published specs" on public.product_specs
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy "public reads published images" on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));

-- Admin: tudo (inclusive rascunhos e preço de revenda). Login sozinho não basta.
create policy "admin all products" on public.products for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "admin all prices" on public.product_prices for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "admin all reseller prices" on public.product_reseller_prices for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "admin all meta" on public.product_admin_meta for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "admin all specs" on public.product_specs for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "admin all images" on public.product_images for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

commit;

-- Primeiro administrador: rodar MANUALMENTE no SQL Editor (papel postgres) depois de criar
-- e confirmar o usuário em Authentication. Usa o ID real do Auth, buscado pelo e-mail:
-- insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = lower('<email-do-admin>')
--   on conflict (user_id, role) do nothing;
-- Conferir: select u.email, r.role from public.user_roles r join auth.users u on u.id = r.user_id;
