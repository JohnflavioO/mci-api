-- InfinitePay Checkout Integrado: persistência do link, reconciliação e preço transacional.
begin;

alter table public.orders
  add column if not exists provider_checkout_url text,
  add column if not exists provider_invoice_slug text,
  add column if not exists provider_transaction_nsu text,
  add column if not exists provider_capture_method text,
  add column if not exists provider_receipt_url text,
  add column if not exists payment_link_created_at timestamptz;

alter table public.order_items
  add column if not exists line_total numeric(12,2) check (line_total is null or line_total > 0);

create unique index if not exists orders_infinitepay_transaction_nsu_uq
  on public.orders(provider_transaction_nsu)
  where provider_transaction_nsu is not null;

comment on column public.orders.provider_checkout_url is 'URL hospedada do checkout InfinitePay; nunca contém API Key.';
comment on column public.orders.provider_invoice_slug is 'Identificador da fatura InfinitePay usado em payment_check.';
comment on column public.orders.provider_transaction_nsu is 'Identificador único da transação InfinitePay confirmado no servidor.';
comment on column public.orders.provider_capture_method is 'Método confirmado pelo payment_check: pix ou credit_card.';
comment on column public.orders.provider_receipt_url is 'URL do comprovante retornada pela InfinitePay.';
comment on column public.order_items.line_total is 'Total da linha já com preço de revendedor e desconto progressivo calculado no banco.';

-- Recalcula os preços exclusivamente a partir do banco. Clientes pagam customer_price;
-- revendedores usam reseller_price quando cadastrado e recebem a maior regra progressiva válida.
-- line_total preserva descontos por unidade sem erro de arredondamento no checkout externo.
create or replace function public.create_order(p_user_id uuid, p_idempotency_key uuid, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_id uuid;
  v_total numeric(12,2) := 0;
  v_volume_discount numeric(12,2) := 0;
  v_is_reseller boolean := false;
  v_base_price numeric(12,2);
  v_line_total numeric(12,2);
  v_unit_total numeric(12,2);
  v_discount numeric(12,2);
  v_position integer;
  v_rule record;
  v_tier jsonb;
  r record;
begin
  select id into v_id from public.orders where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then return v_id; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'itens inválidos' using errcode = '22023';
  end if;
  select exists(select 1 from public.user_roles where user_id = p_user_id and role::text = 'revendedor')
    into v_is_reseller;
  insert into public.orders (user_id, idempotency_key, total) values (p_user_id, p_idempotency_key, 0.01)
    on conflict (user_id, idempotency_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.orders where user_id = p_user_id and idempotency_key = p_idempotency_key;
    return v_id;
  end if;

  for r in
    select p.id, p.name, pr.customer_price, rp.reseller_price, p.stock_quantity,
      (e->>'qty')::integer as qty
    from jsonb_array_elements(p_items) e
    join public.products p on p.id = (e->>'product_id')::uuid and p.status = 'published'
    join public.product_prices pr on pr.product_id = p.id
    left join public.product_reseller_prices rp on rp.product_id = p.id
    order by p.id
  loop
    if r.qty is null or r.qty < 1 then raise exception 'quantidade inválida' using errcode = '22023'; end if;
    if r.stock_quantity is null or r.stock_quantity < r.qty then
      raise exception 'estoque insuficiente para %', r.id using errcode = '23514';
    end if;
    v_base_price := case when v_is_reseller then coalesce(r.reseller_price, r.customer_price) else r.customer_price end;
    if v_base_price is null or v_base_price <= 0 then raise exception 'produto sem preço válido' using errcode = '23514'; end if;
    v_line_total := round(v_base_price * r.qty, 2);

    if v_is_reseller then
      select * into v_rule
      from public.reseller_volume_discount_rules rule
      where rule.is_active
        and r.id::text = any(rule.product_ids)
        and r.qty >= rule.min_quantity
        and (rule.max_quantity is null or r.qty <= rule.max_quantity)
      order by rule.min_quantity desc
      limit 1;

      if found then
        if jsonb_typeof(v_rule.quantity_discounts) = 'array' and jsonb_array_length(v_rule.quantity_discounts) > 0 then
          v_unit_total := 0;
          for v_position in 1..r.qty loop
            v_discount := 0;
            v_tier := null;
            select value into v_tier
            from jsonb_array_elements(v_rule.quantity_discounts) as tiers(value)
            where (value->>'quantity')::integer = v_position
            limit 1;
            if v_tier is not null then
              if v_tier->>'discount_type' = 'percentage' then
                v_discount := round(v_base_price * (v_tier->>'discount_value')::numeric / 100, 2);
              else
                v_discount := (v_tier->>'discount_value')::numeric;
              end if;
            end if;
            v_unit_total := v_unit_total + greatest(0, v_base_price - v_discount);
          end loop;
          v_line_total := round(v_unit_total, 2);
        elsif v_rule.discount_type = 'percentage' then
          v_line_total := round(v_base_price * (1 - v_rule.discount_value / 100) * r.qty, 2);
        else
          v_line_total := round(greatest(0, v_base_price - v_rule.discount_value) * r.qty, 2);
        end if;
      end if;
    end if;

    if v_line_total <= 0 then raise exception 'O desconto aplicado deixou o produto sem valor de cobrança.' using errcode = '23514'; end if;
    insert into public.order_items (order_id, product_id, name_snapshot, unit_price, qty, line_total)
      values (v_id, r.id, r.name, round(v_line_total / r.qty, 2), r.qty, v_line_total);
    v_total := v_total + v_line_total;
    v_volume_discount := v_volume_discount + greatest(0, round(v_base_price * r.qty, 2) - v_line_total);
  end loop;

  if (select count(*) from public.order_items where order_id = v_id) <> jsonb_array_length(p_items) then
    raise exception 'produto indisponível ou duplicado' using errcode = '23514';
  end if;
  update public.orders set total = v_total + coalesce(shipping_amount, 0), volume_discount_amount = v_volume_discount, updated_at = now() where id = v_id;
  return v_id;
end $$;

revoke all on function public.create_order(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb) to service_role;

commit;
