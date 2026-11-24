-- Store House Pontos: controle do admin (lista de clientes com saldo e ajuste manual auditado).
-- Depende de 20261127100000_store_house_pontos.sql.
-- Aplicar manualmente no projeto Supabase da loja (SQL Editor).
begin;

-- Um resumo por cliente que já teve qualquer movimento de pontos.
create or replace function public.loyalty_customers_summary()
returns table (
  user_id uuid, email text, full_name text,
  available integer, pending integer, expiring_30d integer,
  earned bigint, redeemed bigint, expired bigint, adjusted bigint,
  last_activity timestamptz, next_expiry timestamptz
)
language sql stable security definer set search_path = pg_catalog, public as $$
  select
    l.user_id,
    u.email::text,
    nullif(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), '')::text,
    coalesce(sum(l.remaining) filter (where l.remaining > 0 and l.available_at <= now() and l.expires_at > now()), 0)::integer,
    coalesce(sum(l.remaining) filter (where l.remaining > 0 and l.available_at > now()), 0)::integer,
    coalesce(sum(l.remaining) filter (where l.remaining > 0 and l.available_at <= now() and l.expires_at > now() and l.expires_at <= now() + interval '30 days'), 0)::integer,
    coalesce(sum(l.points) filter (where l.kind = 'earn'), 0),
    coalesce(-sum(l.points) filter (where l.kind = 'redeem'), 0) - coalesce(sum(l.points) filter (where l.kind = 'redeem_refund'), 0),
    coalesce(-sum(l.points) filter (where l.kind = 'expire'), 0),
    coalesce(sum(l.points) filter (where l.kind = 'adjust'), 0),
    max(l.created_at),
    min(l.expires_at) filter (where l.remaining > 0 and l.available_at <= now() and l.expires_at > now())
  from public.loyalty_points_ledger l
  join auth.users u on u.id = l.user_id
  group by l.user_id, u.email, u.raw_user_meta_data;
$$;
revoke all on function public.loyalty_customers_summary() from public, anon, authenticated;
grant execute on function public.loyalty_customers_summary() to service_role;

-- Ajuste manual pelo admin (cortesia, correção, atendimento). Sempre com motivo e autor registrados.
--   positivo: cria um lote disponível na hora, com a validade das regras atuais;
--   negativo: retira dos lotes disponíveis que vencem primeiro; não deixa o saldo negativo.
create or replace function public.admin_adjust_loyalty_points(p_user_id uuid, p_points integer, p_reason text, p_admin_id uuid)
returns public.loyalty_points_ledger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  s public.loyalty_settings;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 300), '');
  v_entry public.loyalty_points_ledger;
  v_available integer;
  v_left integer;
  v_take integer;
  lot record;
begin
  if v_reason is null then raise exception 'LOY_REASON_REQUIRED'; end if;
  if p_points is null or p_points = 0 or abs(p_points) > 10000000 then raise exception 'LOY_INVALID_POINTS'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'LOY_CUSTOMER_NOT_FOUND'; end if;
  select * into s from public.loyalty_settings where id = true;
  -- Serializa movimentos do mesmo cliente.
  perform pg_advisory_xact_lock(hashtextextended('loyalty:' || p_user_id::text, 0));
  perform public.loyalty_expire_points(p_user_id);

  if p_points > 0 then
    insert into public.loyalty_points_ledger (user_id, kind, points, idempotency_key, available_at, expires_at, remaining, description, created_by)
    values (p_user_id, 'adjust', p_points, 'loyalty:adjust:' || gen_random_uuid(), now(),
            now() + make_interval(months => coalesce(s.expiry_months, 12)), p_points, v_reason, p_admin_id)
    returning * into v_entry;
  else
    select coalesce(sum(remaining), 0) into v_available from public.loyalty_points_ledger
     where user_id = p_user_id and remaining > 0 and available_at <= now() and expires_at > now();
    if v_available < -p_points then raise exception 'LOY_INSUFFICIENT'; end if;
    v_left := -p_points;
    for lot in
      select id, remaining from public.loyalty_points_ledger
       where user_id = p_user_id and remaining > 0 and available_at <= now() and expires_at > now()
       order by expires_at, created_at for update
    loop
      exit when v_left <= 0;
      v_take := least(lot.remaining, v_left);
      update public.loyalty_points_ledger set remaining = remaining - v_take where id = lot.id;
      v_left := v_left - v_take;
    end loop;
    insert into public.loyalty_points_ledger (user_id, kind, points, idempotency_key, description, created_by)
    values (p_user_id, 'adjust', p_points, 'loyalty:adjust:' || gen_random_uuid(), v_reason, p_admin_id)
    returning * into v_entry;
  end if;
  return v_entry;
end $$;
revoke all on function public.admin_adjust_loyalty_points(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_adjust_loyalty_points(uuid, integer, text, uuid) to service_role;

commit;
