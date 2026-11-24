-- Store House | Afiliados fase 3: pontos e recompensas.
--
-- Pontos (dois saldos independentes, regras em affiliate_settings):
--   * desempenho  = floor(base da comissão × performance_points_per_real)  -> metas e ranking, não resgatável;
--   * recompensa  = floor(base da comissão × reward_points_per_real), só se reward_points_enabled -> resgatável.
--   Desempenho entra quando a comissão nasce (pedido atribuído pago). Recompensa só entra quando a comissão
--   é liberada (status 'available', após a carência), como o dinheiro: assim não dá para resgatar pontos de
--   uma venda que ainda pode ser estornada. Ambos saem se a comissão for estornada (reversed_at, fase 2).
--   Lançamentos são imutáveis e idempotentes (idempotency_key única).
--
-- Recompensas: o admin mantém o catálogo; o afiliado pede o resgate, os pontos e o estoque ficam
-- reservados na hora; o admin aprova, marca como entregue ou recusa (pontos e estoque voltam).
--
-- Funções SECURITY DEFINER executáveis só pelo service_role (rotas do servidor).
-- Aplicar manualmente no projeto Supabase da loja (SQL Editor), depois das migrations de 24/11.
begin;

alter table public.affiliate_reward_catalog
  add column if not exists image_url text check (image_url is null or image_url ~ '^https://');
alter table public.affiliate_reward_redemptions
  add column if not exists admin_note text,
  add column if not exists delivered_at timestamptz;
create index if not exists affiliate_reward_redemptions_affiliate_idx
  on public.affiliate_reward_redemptions(affiliate_user_id, created_at desc);
create index if not exists affiliate_points_ledger_order_idx
  on public.affiliate_points_ledger(source_order_id) where source_order_id is not null;

-- Saldo de pontos por tipo.
create or replace function public.affiliate_points_balance(p_user_id uuid)
returns table (performance integer, reward integer)
language sql stable security definer set search_path = pg_catalog, public as $$
  select
    coalesce(sum(points_delta) filter (where points_type = 'performance'), 0)::integer,
    coalesce(sum(points_delta) filter (where points_type = 'reward'), 0)::integer
  from public.affiliate_points_ledger where affiliate_user_id = p_user_id;
$$;
revoke all on function public.affiliate_points_balance(uuid) from public, anon, authenticated;
grant execute on function public.affiliate_points_balance(uuid) to service_role;

-- Credita um tipo de ponto de uma comissão (usado pelo gatilho e pelo preenchimento retroativo).
create or replace function public.credit_affiliate_points_for_commission(p_commission_id uuid, p_points_type text)
returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  c public.affiliate_commissions;
  s public.affiliate_settings;
  v_perf integer := 0;
  v_reward integer := 0;
begin
  select * into c from public.affiliate_commissions where id = p_commission_id;
  if not found or c.reversed_at is not null or c.status in ('reversed','cancelled') then return; end if;
  select * into s from public.affiliate_settings where id = true;
  if not found then return; end if;
  if p_points_type = 'performance' then
    v_perf := floor(c.order_total * coalesce(s.performance_points_per_real, 0));
  elsif p_points_type = 'reward' and s.reward_points_enabled then
    v_reward := floor(c.order_total * coalesce(s.reward_points_per_real, 0));
  end if;
  if v_perf > 0 then
    insert into public.affiliate_points_ledger (affiliate_user_id, points_type, points_delta, event_type, source_order_id, idempotency_key, description, metadata)
    values (c.affiliate_user_id, 'performance', v_perf, 'sale', c.order_id, 'points:performance:sale:' || c.order_id,
            'Venda do pedido ' || upper(left(c.order_id::text, 8)),
            jsonb_build_object('base', c.order_total, 'points_per_real', s.performance_points_per_real))
    on conflict (idempotency_key) do nothing;
  end if;
  if v_reward > 0 then
    insert into public.affiliate_points_ledger (affiliate_user_id, points_type, points_delta, event_type, source_order_id, idempotency_key, description, metadata)
    values (c.affiliate_user_id, 'reward', v_reward, 'sale', c.order_id, 'points:reward:sale:' || c.order_id,
            'Venda do pedido ' || upper(left(c.order_id::text, 8)),
            jsonb_build_object('base', c.order_total, 'points_per_real', s.reward_points_per_real))
    on conflict (idempotency_key) do nothing;
  end if;
end $$;
revoke all on function public.credit_affiliate_points_for_commission(uuid, text) from public, anon, authenticated;
grant execute on function public.credit_affiliate_points_for_commission(uuid, text) to service_role;

-- Retira exatamente o que foi creditado por aquela venda (uma vez por tipo).
create or replace function public.reverse_affiliate_points_for_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare e record;
begin
  for e in
    select affiliate_user_id, points_type, points_delta from public.affiliate_points_ledger
     where source_order_id = p_order_id and event_type = 'sale'
  loop
    insert into public.affiliate_points_ledger (affiliate_user_id, points_type, points_delta, event_type, source_order_id, idempotency_key, description)
    values (e.affiliate_user_id, e.points_type, -e.points_delta, 'reversal', p_order_id,
            'points:' || e.points_type || ':reversal:' || p_order_id,
            'Estorno do pedido ' || upper(left(p_order_id::text, 8)))
    on conflict (idempotency_key) do nothing;
  end loop;
end $$;
revoke all on function public.reverse_affiliate_points_for_order(uuid) from public, anon, authenticated;
grant execute on function public.reverse_affiliate_points_for_order(uuid) to service_role;

create or replace function public.affiliate_points_on_commission()
returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    perform public.credit_affiliate_points_for_commission(new.id, 'performance');
    if new.status in ('available','paid') then perform public.credit_affiliate_points_for_commission(new.id, 'reward'); end if;
  else
    if new.reversed_at is not null and old.reversed_at is null then
      perform public.reverse_affiliate_points_for_order(new.order_id);
    elsif new.status = 'available' and old.status is distinct from 'available' then
      perform public.credit_affiliate_points_for_commission(new.id, 'reward');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.affiliate_points_on_commission() from public, anon, authenticated;
drop trigger if exists affiliate_commissions_points on public.affiliate_commissions;
create trigger affiliate_commissions_points
  after insert or update of reversed_at, status on public.affiliate_commissions
  for each row execute function public.affiliate_points_on_commission();

-- Vendas já pagas antes desta migration também recebem os pontos (idempotente):
-- desempenho para toda comissão válida; recompensa para as já liberadas ou pagas.
select public.credit_affiliate_points_for_commission(id, 'performance')
  from public.affiliate_commissions
 where reversed_at is null and status not in ('reversed','cancelled');
select public.credit_affiliate_points_for_commission(id, 'reward')
  from public.affiliate_commissions
 where reversed_at is null and status in ('available','paid');

-- Pedido de resgate: reserva os pontos e uma unidade do estoque na hora.
-- Erros de regra usam mensagens fixas (AFF_*) que a rota traduz para o usuário.
create or replace function public.request_affiliate_reward(p_user_id uuid, p_reward_id uuid)
returns public.affiliate_reward_redemptions
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_profile public.affiliate_profiles;
  v_reward public.affiliate_reward_catalog;
  v_balance integer;
  v_redemption public.affiliate_reward_redemptions;
begin
  -- Trava o perfil: dois resgates simultâneos do mesmo afiliado ficam em fila.
  select * into v_profile from public.affiliate_profiles where user_id = p_user_id for update;
  if not found then raise exception 'AFF_NOT_FOUND'; end if;
  if v_profile.status <> 'active' then raise exception 'AFF_SUSPENDED'; end if;
  select * into v_reward from public.affiliate_reward_catalog where id = p_reward_id for update;
  if not found or not v_reward.active then raise exception 'AFF_REWARD_UNAVAILABLE'; end if;
  if v_reward.stock_quantity is not null and v_reward.stock_quantity <= 0 then raise exception 'AFF_REWARD_OUT_OF_STOCK'; end if;
  select reward into v_balance from public.affiliate_points_balance(p_user_id);
  if coalesce(v_balance, 0) < v_reward.points_cost then raise exception 'AFF_NOT_ENOUGH_POINTS'; end if;

  insert into public.affiliate_reward_redemptions (affiliate_user_id, reward_id, points_cost, idempotency_key)
  values (p_user_id, p_reward_id, v_reward.points_cost, gen_random_uuid()::text)
  returning * into v_redemption;
  insert into public.affiliate_points_ledger (affiliate_user_id, points_type, points_delta, event_type, idempotency_key, description, metadata)
  values (p_user_id, 'reward', -v_reward.points_cost, 'redemption', 'reward:redeem:' || v_redemption.id,
          'Resgate: ' || v_reward.name, jsonb_build_object('redemption_id', v_redemption.id, 'reward_id', v_reward.id));
  if v_reward.stock_quantity is not null then
    update public.affiliate_reward_catalog set stock_quantity = stock_quantity - 1, updated_at = now() where id = v_reward.id;
  end if;
  return v_redemption;
end $$;
revoke all on function public.request_affiliate_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_affiliate_reward(uuid, uuid) to service_role;

-- Admin: approve (requested -> approved), deliver (requested/approved -> delivered),
-- reject (requested/approved -> rejected, devolve pontos e estoque).
create or replace function public.review_affiliate_reward(p_redemption_id uuid, p_admin_id uuid, p_action text, p_note text default null)
returns public.affiliate_reward_redemptions
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v public.affiliate_reward_redemptions;
  v_reward public.affiliate_reward_catalog;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
begin
  select * into v from public.affiliate_reward_redemptions where id = p_redemption_id for update;
  if not found then raise exception 'AFF_REDEMPTION_NOT_FOUND'; end if;
  if p_action = 'approve' then
    if v.status <> 'requested' then raise exception 'AFF_REDEMPTION_CLOSED'; end if;
    update public.affiliate_reward_redemptions set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now(),
      admin_note = coalesce(v_note, admin_note) where id = v.id returning * into v;
  elsif p_action = 'deliver' then
    if v.status not in ('requested','approved') then raise exception 'AFF_REDEMPTION_CLOSED'; end if;
    update public.affiliate_reward_redemptions set status = 'delivered', reviewed_by = p_admin_id,
      reviewed_at = coalesce(reviewed_at, now()), delivered_at = now(), admin_note = coalesce(v_note, admin_note)
      where id = v.id returning * into v;
  elsif p_action = 'reject' then
    if v.status not in ('requested','approved') then raise exception 'AFF_REDEMPTION_CLOSED'; end if;
    if v_note is null then raise exception 'AFF_REASON_REQUIRED'; end if;
    update public.affiliate_reward_redemptions set status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now(),
      admin_note = v_note where id = v.id returning * into v;
    insert into public.affiliate_points_ledger (affiliate_user_id, points_type, points_delta, event_type, idempotency_key, description, metadata, created_by)
    values (v.affiliate_user_id, 'reward', v.points_cost, 'reversal', 'reward:refund:' || v.id,
            'Resgate recusado: pontos devolvidos', jsonb_build_object('redemption_id', v.id), p_admin_id)
    on conflict (idempotency_key) do nothing;
    select * into v_reward from public.affiliate_reward_catalog where id = v.reward_id for update;
    if found and v_reward.stock_quantity is not null then
      update public.affiliate_reward_catalog set stock_quantity = stock_quantity + 1, updated_at = now() where id = v_reward.id;
    end if;
  else
    raise exception 'AFF_INVALID_ACTION';
  end if;
  return v;
end $$;
revoke all on function public.review_affiliate_reward(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_affiliate_reward(uuid, uuid, text, text) to service_role;

commit;
