-- Store House | Affiliate attribution query indexes and persisted discount flags
begin;
create index if not exists affiliate_links_product_idx on public.affiliate_links(product_id);
create index if not exists orders_affiliate_link_created_idx on public.orders(affiliate_link_id, created_at desc) where affiliate_link_id is not null;
create index if not exists affiliate_settings_log_admin_idx on public.affiliate_settings_log(admin_id, created_at desc);

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
  v_product_pct numeric(5,2);
  v_pct numeric(5,2);
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
  select p.affiliate_pct into v_product_pct
    from public.order_items oi join public.products p on p.id = oi.product_id
    where oi.order_id = v_order_id order by oi.product_id limit 1;

  if (v_has_coupon and not v_settings.stack_with_coupon)
     or (v_has_volume_discount and not v_settings.stack_with_volume_discount)
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
    'has_coupon', v_has_coupon,
    'has_volume_discount', v_has_volume_discount,
    'is_reseller', v_is_reseller,
    'affiliate_override_pct', v_profile.commission_override_pct,
    'product_affiliate_pct', v_product_pct
  );
  update public.orders set affiliate_link_id = v_link.id, attributed_at = now(),
    commission_pct_applied = v_pct, commission_base_amount = v_base, rules_snapshot = v_rules
  where id = v_order_id and attributed_at is null;
  return v_order_id;
end $affiliate_order$;
revoke all on function public.create_order_with_affiliate(uuid,uuid,jsonb,uuid,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.create_order_with_affiliate(uuid,uuid,jsonb,uuid,text,boolean,boolean) to service_role;
commit;
