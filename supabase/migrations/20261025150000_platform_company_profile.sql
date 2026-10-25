-- MCI Xpress: dados institucionais da empresa proprietária e da loja.
-- Esta migration é proposta para revisão; não executar automaticamente em produção.

begin;

create table if not exists public.platform_company_profile (
  id smallint primary key default 1 check (id = 1),
  legal_name text not null default '',
  trade_name text not null default 'MCI Xpress',
  cnpj text not null default '',
  state_registration text not null default '',
  municipal_registration text not null default '',
  tax_regime text not null default '',
  address_postal_code text not null default '',
  address_street text not null default '',
  address_number text not null default '',
  address_complement text not null default '',
  address_district text not null default '',
  address_city text not null default '',
  address_state char(2) not null default '',
  address_country text not null default 'Brasil',
  phone text not null default '',
  institutional_email text not null default '',
  website text not null default '',
  store_name text not null default 'MCI Xpress',
  store_support_email text not null default '',
  store_support_phone text not null default '',
  store_footer_text text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.platform_company_profile (id) values (1)
on conflict (id) do nothing;

alter table public.platform_company_profile enable row level security;
revoke all on public.platform_company_profile from public, anon, authenticated;
grant select, update on public.platform_company_profile to authenticated;
grant all on public.platform_company_profile to service_role;

drop policy if exists "Super admins read company profile" on public.platform_company_profile;
create policy "Super admins read company profile"
on public.platform_company_profile for select to authenticated
using (public.has_role('admin'::public.app_role));

drop policy if exists "Super admins update company profile" on public.platform_company_profile;
create policy "Super admins update company profile"
on public.platform_company_profile for update to authenticated
using (public.has_role('admin'::public.app_role))
with check (public.has_role('admin'::public.app_role));

create or replace function public.touch_platform_company_profile()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists platform_company_profile_touch on public.platform_company_profile;
create trigger platform_company_profile_touch
before update on public.platform_company_profile
for each row execute function public.touch_platform_company_profile();

commit;
