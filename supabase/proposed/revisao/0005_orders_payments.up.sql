-- 0005 (PROPOSTA, NÃO APLICADA): pedidos e pagamentos Mercado Pago (Pix e cartão).
-- Requer 0001 v2 + 0004. Preço e estoque são decididos aqui no banco; o frontend só envia {product_id, qty}.
begin;

create type public.order_status as enum ('pending_payment','paid','rejected','cancelled','refunded');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  status public.order_status not null default 'pending_payment',
  currency text not null default 'BRL' check (currency = 'BRL'),
  total numeric(12,2) not null check (total > 0),
  stock_debited boolean not null default false,
  mp_preference_id text,
  mp_payment_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  name_snapshot text not null,
  unit_price numeric(12,2) not null check (unit_price > 0),
  qty integer not null check (qty between 1 and 999),
  unique (order_id, product_id)
);

-- Cada notificação do provedor é registrada uma vez (idempotência do webhook).
create table public.payment_events (
  id bigserial primary key,
  provider text not null default 'mercadopago',
  provider_event_id text not null,
  mp_payment_id text not null,
  mp_status text not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id, mp_status)
);

grant select on public.orders, public.order_items to authenticated;
grant all on public.orders, public.order_items, public.payment_events to service_role;
grant usage, select on sequence public.payment_events_id_seq to service_role;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_events enable row level security;

create policy "owner reads orders" on public.orders for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));
create policy "owner reads order items" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_role('admin'))));
-- Sem policies de escrita: só as funções abaixo (service_role, chamadas pelo servidor) gravam.

-- Cria o pedido com preços do banco. Idempotente por (user, key): repetir devolve o mesmo pedido.
-- NÃO debita estoque: só checa disponibilidade; a baixa ocorre na aprovação do pagamento.
create or replace function public.create_order(p_user_id uuid, p_idempotency_key uuid, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_id uuid; v_total numeric(12,2) := 0; r record;
begin
  select id into v_id from public.orders where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then return v_id; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'itens inválidos' using errcode = '22023';
  end if;
  insert into public.orders (user_id, idempotency_key, total) values (p_user_id, p_idempotency_key, 0.01)
    on conflict (user_id, idempotency_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.orders where user_id = p_user_id and idempotency_key = p_idempotency_key;
    return v_id;
  end if;
  for r in
    select p.id, p.name, pr.customer_price, p.stock_quantity, (e->>'qty')::int as qty
    from jsonb_array_elements(p_items) e
    join public.products p on p.id = (e->>'product_id')::uuid and p.status = 'published'
    join public.product_prices pr on pr.product_id = p.id
    order by p.id
  loop
    if r.qty is null or r.qty < 1 then raise exception 'quantidade inválida' using errcode = '22023'; end if;
    if r.customer_price is null or r.customer_price <= 0 then raise exception 'produto sem preço' using errcode = '23514'; end if;
    if r.stock_quantity is null or r.stock_quantity < r.qty then
      raise exception 'estoque insuficiente para %', r.id using errcode = '23514';
    end if;
    insert into public.order_items (order_id, product_id, name_snapshot, unit_price, qty)
      values (v_id, r.id, r.name, r.customer_price, r.qty);
    v_total := v_total + r.customer_price * r.qty;
  end loop;
  if (select count(*) from public.order_items where order_id = v_id) <> jsonb_array_length(p_items) then
    raise exception 'produto indisponível ou duplicado' using errcode = '23514';
  end if;
  update public.orders set total = v_total where id = v_id;
  return v_id;
end $$;

-- Aplica um status do Mercado Pago (já consultado no servidor via API, nunca confiando só no corpo do webhook).
-- Trava o pedido; baixa estoque uma única vez ao aprovar, em ordem de id; estoque insuficiente
-- => erro e nada é debitado (o servidor então estorna o pagamento).
create or replace function public.apply_payment_status(
  p_order_id uuid, p_mp_payment_id text, p_mp_status text, p_event_id text, p_amount numeric)
returns public.order_status language plpgsql security invoker set search_path = pg_catalog, public as $$
declare o public.orders; r record; v_new public.order_status;
begin
  insert into public.payment_events (provider_event_id, mp_payment_id, mp_status)
    values (p_event_id, p_mp_payment_id, p_mp_status) on conflict do nothing;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;

  v_new := case p_mp_status
    when 'approved' then 'paid'
    when 'rejected' then 'rejected'
    when 'cancelled' then 'cancelled'
    when 'refunded' then 'refunded'
    when 'charged_back' then 'refunded'
    else 'pending_payment' end;  -- pending / in_process / authorized

  if v_new = 'paid' and o.status = 'pending_payment' then
    if p_amount is distinct from o.total then raise exception 'valor divergente' using errcode = '23514'; end if;
    for r in select product_id, qty from public.order_items where order_id = o.id order by product_id loop
      update public.products set stock_quantity = stock_quantity - r.qty
       where id = r.product_id and stock_quantity is not null and stock_quantity >= r.qty;
      if not found then raise exception 'estoque insuficiente para %', r.product_id using errcode = '23514'; end if;
    end loop;
    update public.orders set status = 'paid', stock_debited = true, mp_payment_id = p_mp_payment_id, updated_at = now() where id = o.id;
  elsif v_new = 'refunded' and o.status = 'paid' then
    if o.stock_debited then
      update public.products p set stock_quantity = p.stock_quantity + i.qty
        from public.order_items i where i.order_id = o.id and p.id = i.product_id and p.stock_quantity is not null;
    end if;
    update public.orders set status = 'refunded', stock_debited = false, updated_at = now() where id = o.id;
  elsif v_new in ('rejected','cancelled') and o.status = 'pending_payment' then
    update public.orders set status = v_new, mp_payment_id = p_mp_payment_id, updated_at = now() where id = o.id;
  end if;  -- demais transições (repetidas/fora de ordem) são ignoradas: idempotente
  return (select status from public.orders where id = o.id);
end $$;

revoke all on function public.create_order(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.apply_payment_status(uuid, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb) to service_role;
grant execute on function public.apply_payment_status(uuid, text, text, text, numeric) to service_role;

commit;
