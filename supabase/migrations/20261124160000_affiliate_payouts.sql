-- Store House | Afiliados fase 2: liberação, estorno e saque por Pix manual.
--
-- Ciclo da comissão:
--   pending   -> criada quando o pedido atribuído é pago (trigger existente)
--   available -> após grace_days do pagamento, se o pedido continua pago (release_affiliate_commissions)
--   (available + payout_id) -> incluída num pedido de saque
--   paid      -> admin registrou o Pix (mark_affiliate_payout_paid)
--   reversed  -> pedido estornado antes de entrar num saque
-- Se o estorno acontece depois de a comissão entrar num saque, ela não é apagada: vira um ajuste
-- negativo em affiliate_balance_adjustments, descontado do próximo saque. O histórico nunca é reescrito.
--
-- Todas as funções são SECURITY DEFINER e executáveis só pelo service_role (rotas do servidor).
-- Aplicar manualmente no projeto Supabase da loja (SQL Editor) depois de validar no preview.
begin;

alter table public.affiliate_commissions
  add column if not exists available_at timestamptz,
  add column if not exists payout_id uuid,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  pix_key text not null,
  status text not null default 'requested' check (status in ('requested','paid','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  payment_reference text,
  rejection_reason text,
  check (status <> 'paid' or (reviewed_at is not null and nullif(trim(payment_reference), '') is not null)),
  check (status <> 'rejected' or (reviewed_at is not null and nullif(trim(rejection_reason), '') is not null))
);
-- No máximo um saque em aberto por afiliado.
create unique index if not exists affiliate_payouts_one_open_idx
  on public.affiliate_payouts(affiliate_user_id) where status = 'requested';
create index if not exists affiliate_payouts_status_idx
  on public.affiliate_payouts(status, requested_at desc);
create index if not exists affiliate_payouts_affiliate_idx
  on public.affiliate_payouts(affiliate_user_id, requested_at desc);

do $$ begin
  alter table public.affiliate_commissions
    add constraint affiliate_commissions_payout_fk foreign key (payout_id)
    references public.affiliate_payouts(id) on delete restrict;
exception when duplicate_object then null; end $$;
create index if not exists affiliate_commissions_payout_idx on public.affiliate_commissions(payout_id) where payout_id is not null;

create table if not exists public.affiliate_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  amount numeric(12,2) not null check (amount <> 0),
  reason text not null,
  source_commission_id uuid unique references public.affiliate_commissions(id) on delete restrict,
  payout_id uuid references public.affiliate_payouts(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_balance_adjustments_open_idx
  on public.affiliate_balance_adjustments(affiliate_user_id) where payout_id is null;

do $$
declare t text;
begin
  foreach t in array array['affiliate_payouts','affiliate_balance_adjustments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Libera comissões cujo prazo de carência (snapshot do pedido, ou regra atual) já passou.
create or replace function public.release_affiliate_commissions()
returns integer
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_count integer;
begin
  update public.affiliate_commissions c
     set status = 'available', available_at = now(), updated_at = now()
    from public.orders o
   where c.order_id = o.id
     and c.status = 'pending'
     and o.status = 'paid'
     and c.created_at + make_interval(days => coalesce(
           (o.rules_snapshot->>'grace_days')::integer,
           (select s.grace_days from public.affiliate_settings s where s.id = true),
           7)) <= now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.release_affiliate_commissions() from public, anon, authenticated;
grant execute on function public.release_affiliate_commissions() to service_role;

-- Estorno, contestação ou cancelamento de um pedido que estava pago.
create or replace function public.reverse_affiliate_commission_on_refund()
returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare c public.affiliate_commissions;
begin
  if old.status = 'paid' and new.status is distinct from 'paid' then
    select * into c from public.affiliate_commissions where order_id = new.id for update;
    if not found or c.status in ('reversed','cancelled') or c.reversed_at is not null then
      return new;
    end if;
    if c.status in ('pending','approved','available') and c.payout_id is null then
      update public.affiliate_commissions
         set status = 'reversed', reversed_at = now(), updated_at = now(),
             reversal_reason = 'Pedido ' || new.status::text
       where id = c.id;
    else
      -- Já está num saque (solicitado ou pago): registra o desconto para o próximo saque.
      update public.affiliate_commissions
         set reversed_at = now(), updated_at = now(), reversal_reason = 'Pedido ' || new.status::text
       where id = c.id;
      insert into public.affiliate_balance_adjustments (affiliate_user_id, amount, reason, source_commission_id)
      values (c.affiliate_user_id, -c.commission_amount,
              'Estorno do pedido ' || upper(left(new.id::text, 8)), c.id)
      on conflict (source_commission_id) do nothing;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.reverse_affiliate_commission_on_refund() from public, anon, authenticated;
drop trigger if exists orders_affiliate_commission_reversal on public.orders;
create trigger orders_affiliate_commission_reversal
  after update of status on public.orders
  for each row execute function public.reverse_affiliate_commission_on_refund();

-- Saldo do afiliado (valores em reais).
create or replace function public.affiliate_balance(p_user_id uuid)
returns table (withdrawable numeric, available numeric, adjustments numeric, pending numeric, in_payout numeric, paid numeric)
language sql stable security definer set search_path = pg_catalog, public as $$
  select
    coalesce(a.available, 0) + coalesce(j.adjustments, 0),
    coalesce(a.available, 0),
    coalesce(j.adjustments, 0),
    coalesce(p.pending, 0),
    coalesce(r.in_payout, 0),
    coalesce(d.paid, 0)
  from
    (select sum(commission_amount) available from public.affiliate_commissions
      where affiliate_user_id = p_user_id and status = 'available' and payout_id is null) a,
    (select sum(amount) adjustments from public.affiliate_balance_adjustments
      where affiliate_user_id = p_user_id and payout_id is null) j,
    (select sum(commission_amount) pending from public.affiliate_commissions
      where affiliate_user_id = p_user_id and status in ('pending','approved')) p,
    (select sum(amount) in_payout from public.affiliate_payouts
      where affiliate_user_id = p_user_id and status = 'requested') r,
    (select sum(amount) paid from public.affiliate_payouts
      where affiliate_user_id = p_user_id and status = 'paid') d;
$$;
revoke all on function public.affiliate_balance(uuid) from public, anon, authenticated;
grant execute on function public.affiliate_balance(uuid) to service_role;

-- Pedido de saque: junta tudo que está disponível (comissões + ajustes) num único saque.
-- Erros de regra usam mensagens fixas (AFF_*) que a rota traduz para o usuário.
create or replace function public.request_affiliate_payout(p_user_id uuid)
returns public.affiliate_payouts
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_profile public.affiliate_profiles;
  v_settings public.affiliate_settings;
  v_commission_ids uuid[];
  v_adjustment_ids uuid[];
  v_commissions numeric(12,2);
  v_adjustments numeric(12,2);
  v_amount numeric(12,2);
  v_payout public.affiliate_payouts;
begin
  -- Trava o perfil: dois pedidos simultâneos do mesmo afiliado ficam em fila.
  select * into v_profile from public.affiliate_profiles where user_id = p_user_id for update;
  if not found then raise exception 'AFF_NOT_FOUND'; end if;
  if v_profile.status <> 'active' then raise exception 'AFF_SUSPENDED'; end if;
  if nullif(trim(coalesce(v_profile.payout_pix_key, '')), '') is null then raise exception 'AFF_NO_PIX_KEY'; end if;
  if exists (select 1 from public.affiliate_payouts where affiliate_user_id = p_user_id and status = 'requested') then
    raise exception 'AFF_OPEN_PAYOUT';
  end if;
  select * into v_settings from public.affiliate_settings where id = true;

  perform public.release_affiliate_commissions();

  select array_agg(id), coalesce(sum(commission_amount), 0) into v_commission_ids, v_commissions
    from (select id, commission_amount from public.affiliate_commissions
           where affiliate_user_id = p_user_id and status = 'available' and payout_id is null
           for update) s;
  select array_agg(id), coalesce(sum(amount), 0) into v_adjustment_ids, v_adjustments
    from (select id, amount from public.affiliate_balance_adjustments
           where affiliate_user_id = p_user_id and payout_id is null
           for update) s;
  v_amount := v_commissions + v_adjustments;
  if v_amount <= 0 or v_amount < coalesce(v_settings.min_withdrawal, 0) then
    raise exception 'AFF_BELOW_MINIMUM';
  end if;

  insert into public.affiliate_payouts (affiliate_user_id, amount, pix_key)
  values (p_user_id, v_amount, trim(v_profile.payout_pix_key))
  returning * into v_payout;
  update public.affiliate_commissions set payout_id = v_payout.id, updated_at = now()
   where id = any(coalesce(v_commission_ids, '{}'));
  update public.affiliate_balance_adjustments set payout_id = v_payout.id
   where id = any(coalesce(v_adjustment_ids, '{}'));
  return v_payout;
end $$;
revoke all on function public.request_affiliate_payout(uuid) from public, anon, authenticated;
grant execute on function public.request_affiliate_payout(uuid) to service_role;

-- Admin registrou o Pix: o saque e as comissões dele viram "pagos".
create or replace function public.mark_affiliate_payout_paid(p_payout_id uuid, p_admin_id uuid, p_reference text)
returns public.affiliate_payouts
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_payout public.affiliate_payouts;
begin
  if nullif(trim(coalesce(p_reference, '')), '') is null then raise exception 'AFF_REFERENCE_REQUIRED'; end if;
  select * into v_payout from public.affiliate_payouts where id = p_payout_id for update;
  if not found then raise exception 'AFF_PAYOUT_NOT_FOUND'; end if;
  if v_payout.status <> 'requested' then raise exception 'AFF_PAYOUT_CLOSED'; end if;
  update public.affiliate_payouts
     set status = 'paid', reviewed_by = p_admin_id, reviewed_at = now(), payment_reference = left(trim(p_reference), 200)
   where id = p_payout_id
  returning * into v_payout;
  update public.affiliate_commissions
     set status = 'paid', paid_at = now(), payment_reference = v_payout.payment_reference, updated_at = now()
   where payout_id = p_payout_id;
  return v_payout;
end $$;
revoke all on function public.mark_affiliate_payout_paid(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_affiliate_payout_paid(uuid, uuid, text) to service_role;

-- Admin recusou: tudo volta ao saldo, exceto comissões estornadas enquanto o saque estava aberto.
create or replace function public.reject_affiliate_payout(p_payout_id uuid, p_admin_id uuid, p_reason text)
returns public.affiliate_payouts
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_payout public.affiliate_payouts;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'AFF_REASON_REQUIRED'; end if;
  select * into v_payout from public.affiliate_payouts where id = p_payout_id for update;
  if not found then raise exception 'AFF_PAYOUT_NOT_FOUND'; end if;
  if v_payout.status <> 'requested' then raise exception 'AFF_PAYOUT_CLOSED'; end if;

  -- Comissão estornada durante o saque: o ajuste negativo dela some (nunca foi paga) e ela vira 'reversed'.
  delete from public.affiliate_balance_adjustments a
   using public.affiliate_commissions c
   where a.source_commission_id = c.id and c.payout_id = p_payout_id
     and c.reversed_at is not null and a.payout_id is null;
  update public.affiliate_commissions
     set status = 'reversed', payout_id = null, updated_at = now()
   where payout_id = p_payout_id and reversed_at is not null;
  update public.affiliate_commissions set payout_id = null, updated_at = now() where payout_id = p_payout_id;
  update public.affiliate_balance_adjustments set payout_id = null where payout_id = p_payout_id;

  update public.affiliate_payouts
     set status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now(), rejection_reason = left(trim(p_reason), 500)
   where id = p_payout_id
  returning * into v_payout;
  return v_payout;
end $$;
revoke all on function public.reject_affiliate_payout(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_affiliate_payout(uuid, uuid, text) to service_role;

commit;
