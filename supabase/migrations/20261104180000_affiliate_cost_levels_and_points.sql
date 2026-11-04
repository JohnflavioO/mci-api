-- Store House | Affiliate cost ceiling, levels, sales points and reversals
begin;

alter table public.affiliate_settings
  add column if not exists max_total_affiliate_cost_pct numeric(6,3) not null default 2.000 check (max_total_affiliate_cost_pct between 0 and 100),
  add column if not exists reward_point_value_brl numeric(12,6) not null default 0.002500 check (reward_point_value_brl >= 0),
  add column if not exists reward_points_expiry_months integer not null default 12 check (reward_points_expiry_months between 1 and 120),
  add column if not exists reward_min_redeem_points integer not null default 20000 check (reward_min_redeem_points >= 0),
  add column if not exists performance_window_days integer not null default 90 check (performance_window_days between 1 and 3650),
  add column if not exists simulation_sale_value numeric(12,2) not null default 2500.00 check (simulation_sale_value >= 0),
  add column if not exists commission_cap_per_order numeric(12,2) not null default 100.00 check (commission_cap_per_order >= 0),
  add column if not exists levels jsonb not null default '[
    {"name":"Bronze","min_points":0,"commission_pct":1.0},
    {"name":"Prata","min_points":5000,"commission_pct":1.25},
    {"name":"Ouro","min_points":15000,"commission_pct":1.5},
    {"name":"Diamante","min_points":40000,"commission_pct":1.75}
  ]'::jsonb;

alter table public.affiliate_commissions
  add column if not exists eligible_at timestamptz,
  add column if not exists commission_base_amount numeric(12,2),
  add column if not exists reversed_at timestamptz;

-- Explicit, auditable permission grants. Super admins receive the ceiling permission
-- through the permission function; other admins need an explicit grant.
create table if not exists public.affiliate_permission_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(user_id, permission_key)
);
alter table public.affiliate_permission_grants enable row level security;
revoke all on public.affiliate_permission_grants from anon, authenticated;
grant all on public.affiliate_permission_grants to service_role;

create or replace function public.has_affiliate_permission(p_user_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select
    exists(select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.role::text in ('super_admin','superadmin'))
    or exists(select 1 from public.affiliate_permission_grants g where g.user_id = p_user_id and g.permission_key = p_permission)
$$;
revoke all on function public.has_affiliate_permission(uuid,text) from public, anon, authenticated;
grant execute on function public.has_affiliate_permission(uuid,text) to service_role;

-- Stamp the effective level rate and all financial/points inputs on the order.
create or replace function public.apply_affiliate_level_snapshot()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_settings public.affiliate_settings;
  v_affiliate uuid;
  v_product_pct numeric;
  v_performance_points numeric := 0;
  v_level jsonb;
  v_level_pct numeric;
  v_reward_cost_pct numeric;
  v_commission_ceiling numeric;
  v_final_pct numeric;
  v_snapshot jsonb;
begin
  if new.attributed_at is null or new.affiliate_link_id is null then return new; end if;
  select * into v_settings from public.affiliate_settings where id = true;
  select affiliate_id into v_affiliate
    from public.affiliate_links where id = new.affiliate_link_id;
  select p.affiliate_pct into v_product_pct
    from public.affiliate_links l join public.products p on p.id = l.product_id
    where l.id = new.affiliate_link_id;
  select coalesce(sum(points_delta),0) into v_performance_points
    from public.affiliate_points_ledger
    where affiliate_user_id = v_affiliate and points_type = 'performance'
      and event_type = 'sale'
      and created_at >= now() - make_interval(days => v_settings.performance_window_days);
  select item into v_level
    from jsonb_array_elements(v_settings.levels) item
    where coalesce((item->>'min_points')::numeric,0) <= v_performance_points
    order by (item->>'min_points')::numeric desc limit 1;
  v_level_pct := coalesce((v_level->>'commission_pct')::numeric, v_settings.default_commission_pct);
  v_reward_cost_pct := v_settings.reward_points_per_real * v_settings.reward_point_value_brl * 100;
  v_commission_ceiling := greatest(0, v_settings.max_total_affiliate_cost_pct - v_reward_cost_pct);
  v_final_pct := least(coalesce(v_product_pct, v_level_pct), v_commission_ceiling);
  v_snapshot := coalesce(new.rules_snapshot, '{}'::jsonb) || jsonb_build_object(
    'max_total_affiliate_cost_pct', v_settings.max_total_affiliate_cost_pct,
    'performance_points_per_real', v_settings.performance_points_per_real,
    'reward_points_per_real', v_settings.reward_points_per_real,
    'reward_point_value_brl', v_settings.reward_point_value_brl,
    'reward_points_enabled', v_settings.reward_points_enabled,
    'reward_points_expiry_months', v_settings.reward_points_expiry_months,
    'reward_min_redeem_points', v_settings.reward_min_redeem_points,
    'performance_window_days', v_settings.performance_window_days,
    'simulation_sale_value', v_settings.simulation_sale_value,
    'commission_cap_per_order', v_settings.commission_cap_per_order,
    'levels', v_settings.levels,
    'affiliate_level', v_level->>'name',
    'affiliate_level_min_points', coalesce((v_level->>'min_points')::numeric,0),
    'affiliate_level_commission_pct', v_level_pct,
    'performance_points_before_order', v_performance_points,
    'reward_cost_pct', v_reward_cost_pct,
    'commission_ceiling_pct', v_commission_ceiling,
    'commission_pct_applied', v_final_pct
  );
  new.commission_pct_applied := v_final_pct;
  new.rules_snapshot := v_snapshot;
  return new;
end $$;
drop trigger if exists orders_affiliate_level_snapshot on public.orders;
create trigger orders_affiliate_level_snapshot
  before update of attributed_at on public.orders
  for each row when (new.attributed_at is not null and old.attributed_at is null)
  execute function public.apply_affiliate_level_snapshot();
revoke all on function public.apply_affiliate_level_snapshot() from public, anon, authenticated;

-- Credit both point ledgers only on paid orders. Idempotency keys prevent duplicates.
create or replace function public.apply_affiliate_paid_order_points()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_settings jsonb;
  v_base numeric;
  v_affiliate uuid;
  v_perf integer;
  v_reward integer;
  v_reward_enabled boolean;
begin
  if new.status = 'paid' and old.status is distinct from new.status
     and new.affiliate_link_id is not null and new.commission_base_amount is not null then
    select affiliate_id into v_affiliate from public.affiliate_links where id = new.affiliate_link_id;
    v_settings := coalesce(new.rules_snapshot, '{}'::jsonb);
    v_base := greatest(0, new.commission_base_amount);
    v_perf := floor(v_base * coalesce((v_settings->>'performance_points_per_real')::numeric,0))::integer;
    v_reward_enabled := coalesce((v_settings->>'reward_points_enabled')::boolean,false);
    v_reward := case when v_reward_enabled then floor(v_base * coalesce((v_settings->>'reward_points_per_real')::numeric,0))::integer else 0 end;
    if v_perf > 0 then
      insert into public.affiliate_points_ledger(affiliate_user_id,points_type,points_delta,event_type,source_order_id,idempotency_key,description,metadata)
      values(v_affiliate,'performance',v_perf,'sale',new.id,'affiliate-performance:'||new.id::text,'Pontos de desempenho por venda paga',v_settings)
      on conflict(idempotency_key) do nothing;
    end if;
    if v_reward > 0 then
      insert into public.affiliate_points_ledger(affiliate_user_id,points_type,points_delta,event_type,source_order_id,idempotency_key,description,metadata)
      values(v_affiliate,'reward',v_reward,'sale',new.id,'affiliate-reward:'||new.id::text,'Pontos de recompensa por venda paga',v_settings || jsonb_build_object('expires_at', now() + make_interval(months => coalesce((v_settings->>'reward_points_expiry_months')::integer,12))))
      on conflict(idempotency_key) do nothing;
    end if;
    update public.affiliate_commissions
      set commission_amount = least(commission_amount, coalesce((v_settings->>'commission_cap_per_order')::numeric, commission_amount)),
          commission_base_amount = v_base,
          eligible_at = coalesce(eligible_at, now() + make_interval(days => coalesce((v_settings->>'grace_days')::integer,7))),
          updated_at = now()
      where order_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists orders_affiliate_points_paid on public.orders;
create trigger orders_affiliate_points_paid after update of status on public.orders
  for each row execute function public.apply_affiliate_paid_order_points();
revoke all on function public.apply_affiliate_paid_order_points() from public, anon, authenticated;

-- Reversals append negative entries; original ledger rows remain immutable.
create or replace function public.reverse_affiliate_order_points()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare r record;
begin
  if new.status in ('refunded','cancelled','chargeback') and old.status = 'paid' then
    for r in select * from public.affiliate_points_ledger where source_order_id = new.id and event_type = 'sale' loop
      insert into public.affiliate_points_ledger(affiliate_user_id,points_type,points_delta,event_type,source_order_id,idempotency_key,description,metadata)
      values(r.affiliate_user_id,r.points_type,-r.points_delta,'reversal',new.id,'affiliate-reversal:'||new.id::text||':'||r.points_type,
        'Estorno de pontos por reembolso/cancelamento',jsonb_build_object('reverses',r.id,'original_metadata',r.metadata))
      on conflict(idempotency_key) do nothing;
    end loop;
    update public.affiliate_commissions set status='reversed', reversed_at=now(), updated_at=now()
      where order_id=new.id and status <> 'reversed';
  end if;
  return new;
end $$;
drop trigger if exists orders_affiliate_points_reversed on public.orders;
create trigger orders_affiliate_points_reversed after update of status on public.orders
  for each row execute function public.reverse_affiliate_order_points();
revoke all on function public.reverse_affiliate_order_points() from public, anon, authenticated;

commit;
