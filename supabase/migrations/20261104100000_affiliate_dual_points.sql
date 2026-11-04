-- MCI Xpress | Programa de Afiliados - pontos duplos, comissões e rastreamento
-- Esta migração cria a base transacional. Não credita pontos nem comissões até o fluxo
-- de pedidos pagos chamar as funções idempotentes de liquidação.

begin;

create table if not exists public.affiliate_program_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  default_commission_rate numeric(5,2) not null default 5.00 check (default_commission_rate between 0 and 100),
  attribution_window_days integer not null default 30 check (attribution_window_days between 1 and 365),
  minimum_payout numeric(12,2) not null default 100.00 check (minimum_payout >= 0),
  performance_points_per_real numeric(10,2) not null default 1.00 check (performance_points_per_real >= 0),
  reward_points_per_real numeric(10,2) not null default 1.00 check (reward_points_per_real >= 0),
  reward_points_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.affiliate_program_settings (id) values (true)
on conflict (id) do nothing;

alter table public.affiliate_profiles
  add column if not exists display_name text,
  add column if not exists payout_pix_key text,
  add column if not exists notes text;

create table if not exists public.affiliate_referral_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  referral_code text not null,
  landing_path text,
  visitor_key text,
  converted_user_id uuid references auth.users(id) on delete set null,
  clicked_at timestamptz not null default now(),
  converted_at timestamptz
);
create index if not exists affiliate_referral_clicks_affiliate_date_idx
  on public.affiliate_referral_clicks(affiliate_user_id, clicked_at desc);
create index if not exists affiliate_referral_clicks_visitor_idx
  on public.affiliate_referral_clicks(visitor_key) where visitor_key is not null;

create table if not exists public.affiliate_points_ledger (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  points_type text not null check (points_type in ('performance','reward')),
  points_delta integer not null check (points_delta <> 0),
  event_type text not null check (event_type in ('sale','goal','campaign','redemption','manual_adjustment','reversal','expiration')),
  source_order_id uuid,
  idempotency_key text not null unique,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_points_ledger_balance_idx
  on public.affiliate_points_ledger(affiliate_user_id, points_type, created_at desc);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  order_id uuid not null,
  order_total numeric(12,2) not null check (order_total >= 0),
  commission_rate numeric(5,2) not null check (commission_rate between 0 and 100),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','available','paid','cancelled','reversed')),
  idempotency_key text not null unique,
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);
create index if not exists affiliate_commissions_affiliate_status_idx
  on public.affiliate_commissions(affiliate_user_id, status, created_at desc);

create table if not exists public.affiliate_reward_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  points_cost integer not null check (points_cost > 0),
  active boolean not null default true,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.affiliate_reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  reward_id uuid not null references public.affiliate_reward_catalog(id) on delete restrict,
  points_cost integer not null check (points_cost > 0),
  status text not null default 'requested' check (status in ('requested','approved','delivered','rejected','cancelled')),
  idempotency_key text not null unique,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_reward_redemptions_status_idx
  on public.affiliate_reward_redemptions(status, created_at desc);

-- Toda escrita passa pela camada server-side com service_role. O cliente não recebe
-- permissões de escrita direta nestas tabelas financeiras.
do $$
declare t text;
begin
  foreach t in array array[
    'affiliate_program_settings','affiliate_referral_clicks','affiliate_points_ledger',
    'affiliate_commissions','affiliate_reward_catalog','affiliate_reward_redemptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

commit;
