-- 0005 (PROPOSTA, NÃO APLICADA): pedidos e pagamentos, independente do provedor (previsto: Pagar.me v5, Pix e cartão).
-- Requer 0001 v2 + 0004. Preço e estoque são decididos aqui no banco; o frontend só envia {product_id, qty}.
-- Todas as funções são executáveis só por service_role (servidor). O status de pagamento recebido
-- já vem NORMALIZADO pelo servidor após CONSULTAR a API do provedor (nunca só pelo corpo do webhook).
begin;

-- refund_required = pagamento capturado que precisa ser estornado (ex.: faltou estoque).
-- Só vira 'refunded' quando o provedor confirmar o estorno.
create type public.order_status as enum
  ('pending_payment','paid','rejected','cancelled','refund_required','refunded');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  status public.order_status not null default 'pending_payment',
  currency text not null default 'BRL' check (currency = 'BRL'),
  total numeric(12,2) not null check (total > 0),
  stock_debited boolean not null default false,
  provider text,
  provider_order_id text,
  provider_charge_id text,
  refund_reason text,
  -- Chave fixa por pedido, enviada como Idempotency-Key no estorno: retentativas nunca estornam duas vezes.
  refund_idempotency_key uuid,
  refund_attempts integer not null default 0 check (refund_attempts >= 0),
  refund_locked_until timestamptz,
  refund_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (provider, provider_charge_id),
  check (status <> 'refund_required' or (refund_idempotency_key is not null and not stock_debited))
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
  order_id uuid references public.orders(id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  provider_charge_id text not null,
  status text not null,
  result public.order_status,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id, status)
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

-- Aplica um status normalizado: 'pending','paid','failed','canceled','refunded','chargedback'.
-- Tudo numa transação: registra o evento, trava o pedido e muda o estado.
-- Aprovação: trava os produtos em ordem de id; se QUALQUER item não tiver estoque, nada é debitado
-- e o pedido vira 'refund_required' (evento registrado junto). Senão debita tudo uma única vez.
-- Pagamento aprovado chegando depois de recusado/cancelado (fora de ordem) também vira 'refund_required'.
-- Evento repetido (mesmo id+status) não muda nada. Transições não previstas são ignoradas.
create or replace function public.apply_payment_status(
  p_order_id uuid, p_provider text, p_charge_id text, p_status text, p_event_id text, p_amount numeric)
returns public.order_status language plpgsql security invoker set search_path = pg_catalog, public as $$
declare o public.orders; r record; v_new public.order_status; v_event bigint; v_short boolean := false;
begin
  v_new := case p_status
    when 'paid' then 'paid' when 'failed' then 'rejected' when 'canceled' then 'cancelled'
    when 'refunded' then 'refunded' when 'chargedback' then 'refunded' when 'pending' then 'pending_payment'
    else null end;
  if v_new is null then raise exception 'status inválido' using errcode = '22023'; end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;
  if o.provider_charge_id is not null and o.provider_charge_id <> p_charge_id then
    raise exception 'cobrança não pertence ao pedido' using errcode = '23514';
  end if;

  insert into public.payment_events (order_id, provider, provider_event_id, provider_charge_id, status)
    values (o.id, p_provider, p_event_id, p_charge_id, p_status)
    on conflict do nothing returning id into v_event;
  if v_event is null then return o.status; end if;  -- notificação repetida

  if v_new = 'paid' and p_amount is distinct from o.total then
    raise exception 'valor divergente' using errcode = '23514';
  end if;

  if v_new = 'paid' and o.status = 'pending_payment' then
    for r in
      select i.qty, p.stock_quantity from public.order_items i
      join public.products p on p.id = i.product_id
      where i.order_id = o.id order by p.id for update of p
    loop
      if r.stock_quantity is null or r.stock_quantity < r.qty then v_short := true; end if;
    end loop;
    if v_short then
      update public.orders set status = 'refund_required', refund_reason = 'estoque insuficiente',
        refund_idempotency_key = gen_random_uuid(), provider = p_provider, provider_charge_id = p_charge_id,
        updated_at = now() where id = o.id;
    else
      update public.products p set stock_quantity = p.stock_quantity - i.qty
        from public.order_items i where i.order_id = o.id and p.id = i.product_id;
      update public.orders set status = 'paid', stock_debited = true, provider = p_provider,
        provider_charge_id = p_charge_id, updated_at = now() where id = o.id;
    end if;
  elsif v_new = 'paid' and o.status in ('rejected','cancelled') then
    update public.orders set status = 'refund_required', refund_reason = 'pago após cancelamento',
      refund_idempotency_key = gen_random_uuid(), provider = p_provider, provider_charge_id = p_charge_id,
      updated_at = now() where id = o.id;
  elsif v_new = 'refunded' and o.status in ('paid','refund_required') then
    -- Só devolve estoque que foi de fato debitado, e uma única vez (stock_debited vira false).
    if o.stock_debited then
      update public.products p set stock_quantity = p.stock_quantity + i.qty
        from public.order_items i where i.order_id = o.id and p.id = i.product_id and p.stock_quantity is not null;
    end if;
    update public.orders set status = 'refunded', stock_debited = false, refund_locked_until = null,
      refund_last_error = null, updated_at = now() where id = o.id;
  elsif v_new in ('rejected','cancelled') and o.status = 'pending_payment' then
    update public.orders set status = v_new, provider = p_provider, provider_charge_id = p_charge_id, updated_at = now() where id = o.id;
  end if;

  select status into v_new from public.orders where id = o.id;
  update public.payment_events set result = v_new where id = v_event;
  return v_new;
end $$;

-- Reserva o próximo estorno pendente para um processo do servidor (lease de p_lease_seconds).
-- Dois processos nunca pegam o mesmo pedido ao mesmo tempo (skip locked + lease).
-- Retorna a chave de idempotência fixa do pedido; o servidor a envia ao provedor no estorno.
create or replace function public.claim_refund(p_lease_seconds integer default 120)
returns table (order_id uuid, provider_charge_id text, amount numeric, refund_idempotency_key uuid, attempt integer)
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if p_lease_seconds not between 10 and 3600 then raise exception 'lease inválido' using errcode = '22023'; end if;
  return query
  update public.orders o set refund_attempts = o.refund_attempts + 1,
    refund_locked_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where o.id = (
    select x.id from public.orders x
    where x.status = 'refund_required' and (x.refund_locked_until is null or x.refund_locked_until < now())
    order by x.updated_at limit 1 for update skip locked)
  returning o.id, o.provider_charge_id, o.total, o.refund_idempotency_key, o.refund_attempts;
end $$;

-- Falha ao pedir o estorno: mantém 'refund_required', libera o lease e guarda o erro para nova tentativa.
-- Sucesso do pedido de estorno NÃO muda o status: só apply_payment_status('refunded') após consulta ao provedor.
create or replace function public.record_refund_failure(p_order_id uuid, p_error text)
returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  update public.orders set refund_locked_until = null, refund_last_error = left(coalesce(p_error,''), 500), updated_at = now()
   where id = p_order_id and status = 'refund_required';
end $$;

revoke all on function public.create_order(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.apply_payment_status(uuid, text, text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.claim_refund(integer) from public, anon, authenticated;
revoke all on function public.record_refund_failure(uuid, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb) to service_role;
grant execute on function public.apply_payment_status(uuid, text, text, text, text, numeric) to service_role;
grant execute on function public.claim_refund(integer) to service_role;
grant execute on function public.record_refund_failure(uuid, text) to service_role;

commit;
