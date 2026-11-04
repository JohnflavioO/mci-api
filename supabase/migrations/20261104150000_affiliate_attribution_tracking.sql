-- Store House | Affiliate attribution and centralized rules
begin;

-- Keep the existing rules row and its data, but establish the requested canonical name.
alter table public.affiliate_program_settings rename to affiliate_settings;
alter table public.affiliate_settings rename column default_commission_rate to default_commission_pct;
alter table public.affiliate_settings rename column minimum_payout to min_withdrawal;
alter table public.affiliate_settings
  add column if not exists attribution_model text not null default 'last_click' check (attribution_model in ('last_click')),
  add column if not exists commission_base text not null default 'net' check (commission_base in ('net')),
  add column if not exists grace_days integer not null default 7 check (grace_days between 1 and 365),
  add column if not exists block_self_referral boolean not null default true,
  add column if not exists stack_with_coupon boolean not null default false,
  add column if not exists stack_with_volume_discount boolean not null default false,
  add column if not exists stack_with_reseller boolean not null default false,
  add column if not exists stacked_commission_pct numeric(5,2) not null default 0 check (stacked_commission_pct between 0 and 100);
update public.affiliate_settings set
  enabled = true,
  default_commission_pct = 10,
  attribution_window_days = 30,
  attribution_model = 'last_click',
  commission_base = 'net',
  grace_days = 7,
  min_withdrawal = 50,
  block_self_referral = true,
  stack_with_coupon = false,
  stack_with_volume_discount = false,
  stack_with_reseller = false,
  stacked_commission_pct = 0,
  updated_at = now()
where id = true;

create table if not exists public.affiliate_settings_log (
  id uuid primary key default gen_random_uuid(),
  field text not null,
  old_value jsonb,
  new_value jsonb,
  admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_settings_log_created_idx on public.affiliate_settings_log(created_at desc);
alter table public.affiliate_settings_log enable row level security;
revoke all on public.affiliate_settings_log from anon, authenticated;
grant all on public.affiliate_settings_log to service_role;

alter table public.affiliate_profiles
  add column if not exists commission_override_pct numeric(5,2) check (commission_override_pct between 0 and 100);
alter table public.products
  add column if not exists affiliate_pct numeric(5,2) check (affiliate_pct between 0 and 100);

create table if not exists public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_profiles(user_id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  slug varchar(8) not null unique check (slug ~ '^[A-Za-z0-9]{8}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (affiliate_id, product_id)
);
create index if not exists affiliate_links_affiliate_idx on public.affiliate_links(affiliate_id, created_at desc);
alter table public.affiliate_links enable row level security;
revoke all on public.affiliate_links from anon, authenticated;
grant all on public.affiliate_links to service_role;

create table if not exists public.link_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.affiliate_links(id) on delete cascade,
  visitor_id text not null,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);
create index if not exists link_clicks_link_date_idx on public.link_clicks(link_id, created_at desc);
create index if not exists link_clicks_visitor_link_date_idx on public.link_clicks(visitor_id, link_id, created_at desc);
alter table public.link_clicks enable row level security;
revoke all on public.link_clicks from anon, authenticated;
grant all on public.link_clicks to service_role;

alter table public.orders
  add column if not exists affiliate_link_id uuid references public.affiliate_links(id) on delete set null,
  add column if not exists attributed_at timestamptz,
  add column if not exists commission_pct_applied numeric(5,2) check (commission_pct_applied between 0 and 100),
  add column if not exists commission_base_amount numeric(12,2) check (commission_base_amount >= 0),
  add column if not exists rules_snapshot jsonb,
  add column if not exists shipping_amount numeric(12,2) not null default 0 check (shipping_amount >= 0),
  add column if not exists tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  add column if not exists coupon_discount_amount numeric(12,2) not null default 0 check (coupon_discount_amount >= 0),
  add column if not exists coupon_code text,
  add column if not exists volume_discount_amount numeric(12,2) not null default 0 check (volume_discount_amount >= 0);

-- Deduplicate atomically: a visitor counts at most once per link in each 30-minute window.
create or replace function public.record_affiliate_link_click(
  p_link_id uuid, p_visitor_id text, p_ip_hash text, p_user_agent_hash text
) returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_inserted boolean := false;
begin
  if p_visitor_id is null or length(p_visitor_id) < 16 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id || ':' || p_link_id::text, 0));
  if exists (
    select 1 from public.link_clicks
    where link_id = p_link_id and visitor_id = p_visitor_id
      and created_at >= now() - interval '30 minutes'
  ) then return false; end if;
  insert into public.link_clicks(link_id, visitor_id, ip_hash, user_agent_hash)
  values (p_link_id, p_visitor_id, p_ip_hash, p_user_agent_hash);
  return true;
end $$;
revoke all on function public.record_affiliate_link_click(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_affiliate_link_click(uuid,text,text,text) to service_role;

-- Server-only order wrapper: the affiliate link and visitor identity are supplied by
-- HttpOnly cookies read by the server, never by the browser request body.
create or replace function public.create_order_with_affiliate(
  p_user_id uuid, p_idempotency_key uuid, p_items jsonb,
  p_affiliate_link_id uuid default null, p_visitor_id text default null,
  p_has_coupon boolean default false, p_has_volume_discount boolean default false
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_order_id uuid;
  v_settings public.affiliate_settings;
  v_link public.affiliate_links;
  v_profile public.affiliate_profiles;
  v_product_pct numeric(5,2);
  v_pct numeric(5,2);
  v_base numeric(12,2);
  v_buyer_email text;
  v_buyer_cpf text;
  v_affiliate_email text;
  v_affiliate_cpf text;
  v_is_reseller boolean := false;
  v_rules jsonb;
begin
  v_order_id := public.create_order(p_user_id, p_idempotency_key, p_items);
  -- Idempotency: existing orders are immutable; do not re-attribute/recalculate them.
  if exists (select 1 from public.orders where id = v_order_id and attributed_at is not null) then
    return v_order_id;
  end if;
  if p_affiliate_link_id is null or p_visitor_id is null then return v_order_id; end if;

  select * into v_settings from public.affiliate_settings where id = true;
  if not found or not v_settings.enabled then return v_order_id; end if;
  select * into v_link from public.affiliate_links where id = p_affiliate_link_id and is_active = true;
  if not found then return v_order_id; end if;
  select * into v_profile from public.affiliate_profiles
    where user_id = v_link.affiliate_id and status = 'active';
  if not found then return v_order_id; end if;
  if not exists (
    select 1 from public.link_clicks c
    where c.link_id = v_link.id and c.visitor_id = p_visitor_id
      and c.created_at >= now() - make_interval(days => v_settings.attribution_window_days)
  ) then return v_order_id; end if;

  select email, regexp_replace(coalesce(raw_user_meta_data->>'cpf',''), '\\D','','g')
    into v_buyer_email, v_buyer_cpf from auth.users where id = p_user_id;
  select email, regexp_replace(coalesce(raw_user_meta_data->>'cpf',''), '\\D','','g')
    into v_affiliate_email, v_affiliate_cpf from auth.users where id = v_link.affiliate_id;
  if v_settings.block_self_referral and (
    (v_buyer_email is not null and lower(v_buyer_email) = lower(v_affiliate_email)) or
    (v_buyer_cpf <> '' and v_affiliate_cpf <> '' and v_buyer_cpf = v_affiliate_cpf) or
    p_user_id = v_link.affiliate_id
  ) then return v_order_id; end if;

  select exists(select 1 from public.user_roles where user_id = p_user_id and role::text = 'revendedor')
    into v_is_reseller;
  select p.affiliate_pct into v_product_pct
    from public.order_items oi join public.products p on p.id = oi.product_id
    where oi.order_id = v_order_id order by oi.product_id limit 1;

  if (p_has_coupon and not v_settings.stack_with_coupon)
     or (p_has_volume_discount and not v_settings.stack_with_volume_discount)
     or (v_is_reseller and not v_settings.stack_with_reseller) then
    v_pct := v_settings.stacked_commission_pct;
  else
    v_pct := coalesce(v_profile.commission_override_pct, v_product_pct, v_settings.default_commission_pct);
  end if;

  select greatest(0, o.total - o.shipping_amount - o.tax_amount - o.coupon_discount_amount)
    into v_base from public.orders o where o.id = v_order_id;
  v_rules := jsonb_build_object(
    'attribution_window_days', v_settings.attribution_window_days,
    'attribution_model', v_settings.attribution_model,
    'default_commission_pct', v_settings.default_commission_pct,
    'commission_base', v_settings.commission_base,
    'grace_days', v_settings.grace_days,
    'min_withdrawal', v_settings.min_withdrawal,
    'block_self_referral', v_settings.block_self_referral,
    'stack_with_coupon', v_settings.stack_with_coupon,
    'stack_with_volume_discount', v_settings.stack_with_volume_discount,
    'stack_with_reseller', v_settings.stack_with_reseller,
    'stacked_commission_pct', v_settings.stacked_commission_pct,
    'has_coupon', p_has_coupon,
    'has_volume_discount', p_has_volume_discount,
    'is_reseller', v_is_reseller,
    'affiliate_override_pct', v_profile.commission_override_pct,
    'product_affiliate_pct', v_product_pct
  );
  update public.orders set
    affiliate_link_id = v_link.id, attributed_at = now(),
    commission_pct_applied = v_pct, commission_base_amount = v_base,
    rules_snapshot = v_rules
  where id = v_order_id and attributed_at is null;
  return v_order_id;
end $$;
revoke all on function public.create_order_with_affiliate(uuid,uuid,jsonb,uuid,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.create_order_with_affiliate(uuid,uuid,jsonb,uuid,text,boolean,boolean) to service_role;

commit;
