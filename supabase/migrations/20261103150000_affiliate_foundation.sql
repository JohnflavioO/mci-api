-- MCI Xpress: base operacional do programa de afiliados.
-- Cria o perfil e associa o papel afiliado quando uma conta é cadastrada como afiliado.
-- Não calcula nem paga comissões nesta etapa; isso será ligado ao ciclo real de pedidos pagos.

alter type public.app_role add value if not exists 'afiliado';

create table if not exists public.affiliate_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique,
  commission_rate numeric(5,2) not null default 5.00
    check (commission_rate >= 0 and commission_rate <= 100),
  status text not null default 'active'
    check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiliate_profiles_status_idx
  on public.affiliate_profiles(status, created_at desc);

grant select on public.affiliate_profiles to authenticated;
grant all on public.affiliate_profiles to service_role;
alter table public.affiliate_profiles enable row level security;

drop policy if exists "affiliate reads own profile" on public.affiliate_profiles;
create policy "affiliate reads own profile"
  on public.affiliate_profiles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "admins read affiliate profiles" on public.affiliate_profiles;
create policy "admins read affiliate profiles"
  on public.affiliate_profiles for select to authenticated
  using (public.has_role('admin'));

create or replace function public.handle_affiliate_signup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  code text;
begin
  if m->>'registration_type' is distinct from 'afiliado' then
    return new;
  end if;

  code := lower(substr(replace(new.id::text, '-', ''), 1, 10));

  insert into public.user_roles (user_id, role)
  values (new.id, 'afiliado'::public.app_role)
  on conflict do nothing;

  insert into public.affiliate_profiles (user_id, referral_code)
  values (new.id, code)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_affiliate_signup() from public, anon, authenticated;
drop trigger if exists on_auth_user_affiliate on auth.users;
create trigger on_auth_user_affiliate
  after insert on auth.users
  for each row execute function public.handle_affiliate_signup();
