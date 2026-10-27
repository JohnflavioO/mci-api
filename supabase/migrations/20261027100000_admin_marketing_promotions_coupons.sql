-- MCI Xpress: estrutura inicial para gestão de promoções e cupons no painel administrativo.
-- Revisar e aplicar no Supabase antes de usar os módulos.

create table if not exists public.marketing_promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_promotions_valid_dates check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint marketing_promotions_percentage check (discount_type <> 'percentage' or discount_value <= 100)
);

create table if not exists public.marketing_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,40}$'),
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_coupons_valid_dates check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint marketing_coupons_percentage check (discount_type <> 'percentage' or discount_value <= 100)
);

create index if not exists marketing_promotions_active_window_idx on public.marketing_promotions (is_active, starts_at, ends_at);
create index if not exists marketing_coupons_active_window_idx on public.marketing_coupons (is_active, starts_at, ends_at);
create unique index if not exists marketing_coupons_code_upper_idx on public.marketing_coupons (upper(code));

alter table public.marketing_promotions enable row level security;
alter table public.marketing_coupons enable row level security;

drop policy if exists "Admins manage marketing promotions" on public.marketing_promotions;
create policy "Admins manage marketing promotions" on public.marketing_promotions for all to authenticated
using (public.has_role('admin'::public.app_role)) with check (public.has_role('admin'::public.app_role));

drop policy if exists "Admins manage marketing coupons" on public.marketing_coupons;
create policy "Admins manage marketing coupons" on public.marketing_coupons for all to authenticated
using (public.has_role('admin'::public.app_role)) with check (public.has_role('admin'::public.app_role));

comment on table public.marketing_promotions is 'Campanhas promocionais gerenciadas pela Central Administrativa MCI Xpress.';
comment on table public.marketing_coupons is 'Cupons de desconto gerenciados pela Central Administrativa MCI Xpress. O checkout deve validar disponibilidade e limite no servidor.';
