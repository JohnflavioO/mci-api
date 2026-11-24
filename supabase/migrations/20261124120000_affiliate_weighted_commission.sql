-- Store House | Afiliados fase 1: comissão correta em pedidos com vários produtos.
-- Antes: o percentual vinha só do primeiro produto do pedido (order by product_id limit 1).
-- Agora: com override do afiliado, vale o override; senão, cada linha usa o % do produto
-- (ou o padrão do programa) e o pedido guarda a média ponderada pelo valor de cada linha.
-- Os percentuais passam a ter 4 casas para a média não perder centavos no cálculo da comissão.
-- Aplicar manualmente no projeto Supabase da loja (SQL Editor) depois de validar no preview.
begin;

alter table public.orders alter column commission_pct_applied type numeric(7,4);
alter table public.affiliate_commissions alter column commission_rate type numeric(7,4);

create or replace function public.create_order_with_affiliate(
  p_user_id uuid, p_idempotency_key uuid, p_items jsonb,
  p_affiliate_link_id uuid default null, p_visitor_id text default null,
  p_has_coupon boolean default false, p_has_volume_discount boolean default false
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $affiliate_order$
declare
  v_order_id uuid;
  v_settings public.affiliate_settings;
  v_link public.affiliate_links;
  v_profile public.affiliate_profiles;
  v_product_pcts jsonb;
  v_pct numeric(7,4);
  v_base numeric(12,2);
  v_buyer_email text;
  v_buyer_cpf text;
  v_affiliate_email text;
  v_affiliate_cpf text;
  v_is_reseller boolean := false;
  v_has_coupon boolean := coalesce(p_has_coupon, false);
  v_has_volume_discount boolean := coalesce(p_has_volume_discount, false);
  v_rules jsonb;
begin
  select id into v_order_id from public.orders where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then return v_order_id; end if;
  v_order_id := public.create_order(p_user_id, p_idempotency_key, p_items);
  if p_affiliate_link_id is null or p_visitor_id is null then return v_order_id; end if;

  select (v_has_coupon or coupon_code is not null or coupon_discount_amount > 0),
         (v_has_volume_discount or volume_discount_amount > 0)
    into v_has_coupon, v_has_volume_discount
  from public.orders where id = v_order_id;

  select * into v_settings from public.affiliate_settings where id = true;
  if not found or not v_settings.enabled then return v_order_id; end if;
  select * into v_link from public.affiliate_links where id = p_affiliate_link_id and is_active = true;
  if not found then return v_order_id; end if;
  select * into v_profile from public.affiliate_profiles where user_id = v_link.affiliate_id and status = 'active';
  if not found then return v_order_id; end if;
  if not exists (
    select 1 from public.link_clicks c
    where c.link_id = v_link.id and c.visitor_id = p_visitor_id
      and c.created_at >= now() - make_interval(days => v_settings.attribution_window_days)
  ) then return v_order_id; end if;

  select email, regexp_replace(coalesce(raw_user_meta_data->>'cpf',''), '[^0-9]','','g')
    into v_buyer_email, v_buyer_cpf from auth.users where id = p_user_id;
  select email, regexp_replace(coalesce(raw_user_meta_data->>'cpf',''), '[^0-9]','','g')
    into v_affiliate_email, v_affiliate_cpf from auth.users where id = v_link.affiliate_id;
  if v_settings.block_self_referral and (
    (v_buyer_email is not null and lower(v_buyer_email) = lower(v_affiliate_email)) or
    (v_buyer_cpf <> '' and v_affiliate_cpf <> '' and v_buyer_cpf = v_affiliate_cpf) or
    p_user_id = v_link.affiliate_id
  ) then return v_order_id; end if;

  select exists(select 1 from public.user_roles where user_id = p_user_id and role::text = 'revendedor')
    into v_is_reseller;

  -- % de cada produto do pedido (null = usa o padrão), guardado no snapshot para auditoria.
  select coalesce(jsonb_object_agg(oi.product_id::text, p.affiliate_pct), '{}'::jsonb)
    into v_product_pcts
    from public.order_items oi join public.products p on p.id = oi.product_id
   where oi.order_id = v_order_id;

  if (v_has_coupon and not v_settings.stack_with_coupon)
     or (v_has_volume_discount and not v_settings.stack_with_volume_discount)
     or (v_is_reseller and not v_settings.stack_with_reseller) then
    v_pct := v_settings.stacked_commission_pct;
  elsif v_profile.commission_override_pct is not null then
    v_pct := v_profile.commission_override_pct;
  else
    select round(
             sum(coalesce(oi.line_total, oi.unit_price * oi.qty) * coalesce(p.affiliate_pct, v_settings.default_commission_pct))
             / nullif(sum(coalesce(oi.line_total, oi.unit_price * oi.qty)), 0), 4)
      into v_pct
      from public.order_items oi join public.products p on p.id = oi.product_id
     where oi.order_id = v_order_id;
    v_pct := coalesce(v_pct, v_settings.default_commission_pct);
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
    'has_coupon', v_has_coupon,
    'has_volume_discount', v_has_volume_discount,
    'is_reseller', v_is_reseller,
    'affiliate_override_pct', v_profile.commission_override_pct,
    'product_affiliate_pcts', v_product_pcts,
    'pct_method', 'weighted_by_line_total'
  );
  update public.orders set affiliate_link_id = v_link.id, attributed_at = now(),
    commission_pct_applied = v_pct, commission_base_amount = v_base, rules_snapshot = v_rules
  where id = v_order_id and attributed_at is null;
  return v_order_id;
end $affiliate_order$;
revoke all on function public.create_order_with_affiliate(uuid,uuid,jsonb,uuid,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.create_order_with_affiliate(uuid,uuid,jsonb,uuid,text,boolean,boolean) to service_role;

commit;
