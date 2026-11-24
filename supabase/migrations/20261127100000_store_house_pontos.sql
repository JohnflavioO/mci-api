-- Store House Pontos: programa de pontos do cliente final.
--
-- Regras (decididas em 26/11, ajustáveis em loyalty_settings pelo admin):
--   * ganha 1 ponto por R$ 1,00 pago em produtos (frete não conta), só cliente final (revendedor não participa);
--   * os pontos ficam "em liberação" por grace_days (7, prazo de arrependimento) e depois ficam disponíveis;
--   * cada lote vence expiry_months (12) depois de liberado;
--   * 100 pontos = R$ 1,00 de desconto no checkout, mínimo de 100 pontos, até max_redeem_pct (20%) dos produtos.
--
-- Lotes: cada crédito é um lote com "remaining"; o resgate consome os lotes que vencem primeiro e registra
-- de quais lotes saiu (loyalty_redemption_allocations), para devolver exatamente se o pedido cair.
-- O desconto é distribuído entre os itens do pedido (line_total), então o total cobrado na InfinitePay,
-- a conferência de valor do pagamento e a base da comissão de afiliado continuam consistentes.
--
-- Funções SECURITY DEFINER executáveis só pelo service_role (rotas do servidor).
-- Aplicar manualmente no projeto Supabase da loja (SQL Editor).
begin;

create table if not exists public.loyalty_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  points_per_real numeric(10,2) not null default 1 check (points_per_real >= 0),
  real_per_100_points numeric(10,2) not null default 1.00 check (real_per_100_points > 0),
  max_redeem_pct numeric(5,2) not null default 20 check (max_redeem_pct > 0 and max_redeem_pct <= 50),
  min_redeem_points integer not null default 100 check (min_redeem_points >= 1),
  grace_days integer not null default 7 check (grace_days between 0 and 90),
  expiry_months integer not null default 12 check (expiry_months between 1 and 60),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.loyalty_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.loyalty_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('earn','redeem','redeem_refund','reversal','expire','adjust')),
  points integer not null check (points <> 0),
  order_id uuid references public.orders(id) on delete set null,
  idempotency_key text not null unique,
  -- Só para lotes (earn e adjust positivo): quando libera, quando vence e quanto ainda resta.
  available_at timestamptz,
  expires_at timestamptz,
  remaining integer check (remaining is null or remaining >= 0),
  description text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_ledger_user_idx on public.loyalty_points_ledger(user_id, created_at desc);
create index if not exists loyalty_ledger_lots_idx on public.loyalty_points_ledger(user_id, expires_at) where remaining > 0;
create index if not exists loyalty_ledger_order_idx on public.loyalty_points_ledger(order_id) where order_id is not null;

create table if not exists public.loyalty_redemption_allocations (
  redeem_id uuid not null references public.loyalty_points_ledger(id) on delete cascade,
  lot_id uuid not null references public.loyalty_points_ledger(id) on delete cascade,
  points integer not null check (points > 0),
  refunded boolean not null default false,
  primary key (redeem_id, lot_id)
);

alter table public.orders
  add column if not exists loyalty_points_used integer not null default 0 check (loyalty_points_used >= 0),
  add column if not exists loyalty_discount_amount numeric(12,2) not null default 0 check (loyalty_discount_amount >= 0);

do $$
declare t text;
begin
  foreach t in array array['loyalty_settings','loyalty_points_ledger','loyalty_redemption_allocations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

create or replace function public.loyalty_is_reseller(p_user_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.user_roles where user_id = p_user_id and role::text = 'revendedor');
$$;
revoke all on function public.loyalty_is_reseller(uuid) from public, anon, authenticated;

-- Vence os lotes com prazo esgotado (chamada antes de qualquer consulta de saldo ou resgate).
create or replace function public.loyalty_expire_points(p_user_id uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare lot record; v_count integer := 0;
begin
  for lot in
    select id, remaining from public.loyalty_points_ledger
     where user_id = p_user_id and remaining > 0 and expires_at <= now()
     for update
  loop
    insert into public.loyalty_points_ledger (user_id, kind, points, idempotency_key, description)
    values (p_user_id, 'expire', -lot.remaining, 'loyalty:expire:' || lot.id || ':' || gen_random_uuid(), 'Pontos vencidos')
    on conflict (idempotency_key) do nothing;
    update public.loyalty_points_ledger set remaining = 0 where id = lot.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.loyalty_expire_points(uuid) from public, anon, authenticated;
grant execute on function public.loyalty_expire_points(uuid) to service_role;

-- Saldo do cliente (vence os lotes antes de somar).
create or replace function public.loyalty_balance(p_user_id uuid)
returns table (available integer, pending integer, expiring_30d integer, next_expiry timestamptz)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.loyalty_expire_points(p_user_id);
  return query
  select
    coalesce(sum(remaining) filter (where available_at <= now()), 0)::integer,
    coalesce(sum(remaining) filter (where available_at > now()), 0)::integer,
    coalesce(sum(remaining) filter (where available_at <= now() and expires_at <= now() + interval '30 days'), 0)::integer,
    min(expires_at) filter (where available_at <= now())
  from public.loyalty_points_ledger
  where user_id = p_user_id and remaining > 0;
end $$;
revoke all on function public.loyalty_balance(uuid) from public, anon, authenticated;
grant execute on function public.loyalty_balance(uuid) to service_role;

-- Quantos pontos o cliente pode usar numa compra com este valor em produtos (para o checkout mostrar).
create or replace function public.loyalty_max_redeem(p_user_id uuid, p_products_total numeric)
returns table (max_points integer, max_discount numeric, available integer, eligible boolean)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.loyalty_settings; v_available integer; v_cap integer; v_points integer;
begin
  select * into s from public.loyalty_settings where id = true;
  select b.available into v_available from public.loyalty_balance(p_user_id) b;
  if s.id is null or not s.enabled or public.loyalty_is_reseller(p_user_id) then
    return query select 0, 0::numeric, coalesce(v_available, 0), false; return;
  end if;
  v_cap := floor(floor(greatest(coalesce(p_products_total, 0), 0) * s.max_redeem_pct) / s.real_per_100_points);
  v_points := least(coalesce(v_available, 0), v_cap);
  if v_points < s.min_redeem_points then v_points := 0; end if;
  return query select v_points, floor(v_points * s.real_per_100_points) / 100, coalesce(v_available, 0), true;
end $$;
revoke all on function public.loyalty_max_redeem(uuid, numeric) from public, anon, authenticated;
grant execute on function public.loyalty_max_redeem(uuid, numeric) to service_role;

-- Aplica o resgate num pedido recém-criado (pending_payment). Idempotente: se o pedido já tem pontos, devolve o que foi aplicado.
create or replace function public.apply_loyalty_redemption(p_order_id uuid, p_user_id uuid, p_points integer)
returns table (points_used integer, discount numeric)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  s public.loyalty_settings;
  o public.orders;
  v_subtotal numeric(12,2);
  v_available integer;
  v_cap integer;
  v_use integer;
  v_discount numeric(12,2);
  v_redeem_id uuid;
  v_left integer;
  v_take integer;
  v_items_total numeric(12,2);
  v_share numeric(12,2);
  v_given numeric(12,2) := 0;
  v_count integer;
  v_i integer := 0;
  lot record;
  it record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.user_id <> p_user_id then raise exception 'LOY_ORDER_NOT_FOUND'; end if;
  if o.loyalty_points_used > 0 then return query select o.loyalty_points_used, o.loyalty_discount_amount; return; end if;
  if coalesce(p_points, 0) <= 0 then return query select 0, 0::numeric; return; end if;
  if o.status <> 'pending_payment' then raise exception 'LOY_ORDER_CLOSED'; end if;
  select * into s from public.loyalty_settings where id = true;
  if not found or not s.enabled then raise exception 'LOY_DISABLED'; end if;
  if public.loyalty_is_reseller(p_user_id) then raise exception 'LOY_NOT_ELIGIBLE'; end if;

  perform public.loyalty_expire_points(p_user_id);
  v_subtotal := o.total - coalesce(o.shipping_amount, 0);
  select coalesce(sum(remaining), 0) into v_available from public.loyalty_points_ledger
   where user_id = p_user_id and remaining > 0 and available_at <= now() and expires_at > now();
  v_cap := floor(floor(greatest(v_subtotal, 0) * s.max_redeem_pct) / s.real_per_100_points);
  v_use := least(p_points, v_available, v_cap);
  if v_use < s.min_redeem_points then raise exception 'LOY_BELOW_MINIMUM'; end if;
  v_discount := floor(v_use * s.real_per_100_points) / 100;
  if v_discount <= 0 then raise exception 'LOY_BELOW_MINIMUM'; end if;

  insert into public.loyalty_points_ledger (user_id, kind, points, order_id, idempotency_key, description)
  values (p_user_id, 'redeem', -v_use, o.id, 'loyalty:redeem:' || o.id,
          'Desconto de R$ ' || to_char(v_discount, 'FM999G999G990D00') || ' no pedido ' || upper(left(o.id::text, 8)))
  returning id into v_redeem_id;

  -- Consome primeiro os lotes que vencem antes.
  v_left := v_use;
  for lot in
    select id, remaining from public.loyalty_points_ledger
     where user_id = p_user_id and remaining > 0 and available_at <= now() and expires_at > now()
     order by expires_at, created_at for update
  loop
    exit when v_left <= 0;
    v_take := least(lot.remaining, v_left);
    update public.loyalty_points_ledger set remaining = remaining - v_take where id = lot.id;
    insert into public.loyalty_redemption_allocations (redeem_id, lot_id, points) values (v_redeem_id, lot.id, v_take);
    v_left := v_left - v_take;
  end loop;

  -- Distribui o desconto entre os itens, proporcional ao valor de cada um; o último fica com o arredondamento.
  select coalesce(sum(coalesce(line_total, unit_price * qty)), 0), count(*) into v_items_total, v_count
    from public.order_items where order_id = o.id;
  for it in
    select ctid, coalesce(line_total, unit_price * qty) as line, qty from public.order_items
     where order_id = o.id order by coalesce(line_total, unit_price * qty) desc, product_id
  loop
    v_i := v_i + 1;
    v_share := case when v_i = v_count then v_discount - v_given else round(v_discount * it.line / v_items_total, 2) end;
    if it.line - v_share < 0.01 then raise exception 'LOY_BELOW_MINIMUM'; end if;
    update public.order_items set line_total = it.line - v_share, unit_price = round((it.line - v_share) / it.qty, 2)
     where ctid = it.ctid;
    v_given := v_given + v_share;
  end loop;

  update public.orders set
    total = total - v_discount,
    loyalty_points_used = v_use,
    loyalty_discount_amount = v_discount,
    commission_base_amount = case when commission_base_amount is null then null else greatest(0, commission_base_amount - v_discount) end,
    updated_at = now()
  where id = o.id;
  return query select v_use, v_discount;
end $$;
revoke all on function public.apply_loyalty_redemption(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_loyalty_redemption(uuid, uuid, integer) to service_role;

-- Status do pedido: crédito quando pago, estorno quando deixa de estar pago, devolução do resgate quando o pedido cai.
create or replace function public.loyalty_on_order_status()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  s public.loyalty_settings;
  v_points integer;
  v_lot public.loyalty_points_ledger;
  v_refund integer;
  v_redeem_id uuid;
  a record;
begin
  if new.status is not distinct from old.status then return new; end if;
  select * into s from public.loyalty_settings where id = true;

  -- 1. Pago: cria o lote de pontos do cliente final.
  if new.status = 'paid' and s.id is not null and s.enabled and not public.loyalty_is_reseller(new.user_id) then
    v_points := floor(greatest(new.total - coalesce(new.shipping_amount, 0), 0) * s.points_per_real);
    if v_points > 0 then
      insert into public.loyalty_points_ledger (user_id, kind, points, order_id, idempotency_key, available_at, expires_at, remaining, description)
      values (new.user_id, 'earn', v_points, new.id, 'loyalty:earn:' || new.id,
              now() + make_interval(days => s.grace_days),
              now() + make_interval(days => s.grace_days) + make_interval(months => s.expiry_months),
              v_points, 'Compra do pedido ' || upper(left(new.id::text, 8)))
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  -- 2. Deixou de estar pago (estorno, contestação): retira o que ainda resta do lote daquele pedido.
  if old.status = 'paid' and new.status <> 'paid' then
    select * into v_lot from public.loyalty_points_ledger where idempotency_key = 'loyalty:earn:' || new.id for update;
    if found and v_lot.remaining > 0 then
      insert into public.loyalty_points_ledger (user_id, kind, points, order_id, idempotency_key, description)
      values (v_lot.user_id, 'reversal', -v_lot.remaining, new.id, 'loyalty:reversal:' || new.id,
              'Estorno do pedido ' || upper(left(new.id::text, 8)))
      on conflict (idempotency_key) do nothing;
      update public.loyalty_points_ledger set remaining = 0 where id = v_lot.id;
    end if;
  end if;

  -- 3. Pedido que usou pontos foi recusado, cancelado ou estornado: os pontos voltam para os lotes de origem.
  if new.loyalty_points_used > 0 and new.status in ('rejected','cancelled','refunded','refund_required') then
    select id into v_redeem_id from public.loyalty_points_ledger where idempotency_key = 'loyalty:redeem:' || new.id;
    if found then
      v_refund := 0;
      for a in select lot_id, points from public.loyalty_redemption_allocations where redeem_id = v_redeem_id and not refunded for update loop
        update public.loyalty_points_ledger set remaining = remaining + a.points where id = a.lot_id;
        v_refund := v_refund + a.points;
      end loop;
      update public.loyalty_redemption_allocations set refunded = true where redeem_id = v_redeem_id;
      if v_refund > 0 then
        insert into public.loyalty_points_ledger (user_id, kind, points, order_id, idempotency_key, description)
        values (new.user_id, 'redeem_refund', v_refund, new.id, 'loyalty:redeem-refund:' || new.id,
                'Pontos devolvidos do pedido ' || upper(left(new.id::text, 8)))
        on conflict (idempotency_key) do nothing;
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.loyalty_on_order_status() from public, anon, authenticated;
drop trigger if exists orders_loyalty_points on public.orders;
create trigger orders_loyalty_points
  after update of status on public.orders
  for each row execute function public.loyalty_on_order_status();

-- Números do programa para o admin (pontos e valor em reais do saldo dos clientes).
create or replace function public.loyalty_program_stats()
returns table (customers integer, issued bigint, redeemed bigint, expired bigint, available bigint, pending bigint, liability numeric)
language sql stable security definer set search_path = pg_catalog, public as $$
  select
    count(distinct user_id) filter (where kind = 'earn')::integer,
    coalesce(sum(points) filter (where kind = 'earn'), 0),
    coalesce(-sum(points) filter (where kind = 'redeem'), 0) - coalesce(sum(points) filter (where kind = 'redeem_refund'), 0),
    coalesce(-sum(points) filter (where kind = 'expire'), 0),
    coalesce(sum(remaining) filter (where remaining > 0 and available_at <= now() and expires_at > now()), 0),
    coalesce(sum(remaining) filter (where remaining > 0 and available_at > now()), 0),
    round(coalesce(sum(remaining) filter (where remaining > 0 and expires_at > now()), 0)
          * (select real_per_100_points from public.loyalty_settings where id = true) / 100, 2)
  from public.loyalty_points_ledger;
$$;
revoke all on function public.loyalty_program_stats() from public, anon, authenticated;
grant execute on function public.loyalty_program_stats() to service_role;

commit;
