-- MCI Xpress: vincula campanhas promocionais a todos os produtos, produtos selecionados ou categorias.
-- Esta migration é proposta para revisão; não é executada automaticamente.
alter table public.marketing_promotions
  add column if not exists target_mode text not null default 'all'
  check (target_mode in ('all', 'products', 'categories'));

create table if not exists public.marketing_promotion_products (
  promotion_id uuid not null references public.marketing_promotions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (promotion_id, product_id)
);

create table if not exists public.marketing_promotion_categories (
  promotion_id uuid not null references public.marketing_promotions(id) on delete cascade,
  category text not null check (length(trim(category)) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (promotion_id, category)
);

create index if not exists marketing_promotion_products_product_idx
  on public.marketing_promotion_products(product_id);
create index if not exists marketing_promotion_categories_category_idx
  on public.marketing_promotion_categories(category);

alter table public.marketing_promotion_products enable row level security;
alter table public.marketing_promotion_categories enable row level security;

drop policy if exists "Admins manage promotion product targets" on public.marketing_promotion_products;
create policy "Admins manage promotion product targets"
  on public.marketing_promotion_products for all to authenticated
  using (public.has_role('admin'::public.app_role))
  with check (public.has_role('admin'::public.app_role));

drop policy if exists "Admins manage promotion category targets" on public.marketing_promotion_categories;
create policy "Admins manage promotion category targets"
  on public.marketing_promotion_categories for all to authenticated
  using (public.has_role('admin'::public.app_role))
  with check (public.has_role('admin'::public.app_role));

comment on column public.marketing_promotions.target_mode is
  'Define se a campanha abrange todos os produtos, produtos selecionados ou categorias selecionadas.';
