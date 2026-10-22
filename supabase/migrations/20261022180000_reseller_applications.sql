-- MCI Xpress: cadastro e aprovação de revendedores.
-- Pré-requisito: public.app_role, public.user_roles e public.has_role('admin') já existem.
-- Revise o schema no projeto Supabase antes de executar em produção.

begin;

do $$ begin
  create type public.reseller_status as enum ('pendente', 'documentacao_solicitada', 'aprovado', 'rejeitado');
exception when duplicate_object then null;
end $$;

create or replace function public.is_valid_cnpj(_cnpj text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare
  c text := regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g');
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; i int;
begin
  if length(c) <> 14 or c ~ '^(\d)\1+$' then return false; end if;
  s := 0;
  for i in 1..12 loop s := s + w1[i] * substr(c, i, 1)::int; end loop;
  r := s % 11;
  if (case when r < 2 then 0 else 11 - r end) <> substr(c, 13, 1)::int then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + w2[i] * substr(c, i, 1)::int; end loop;
  r := s % 11;
  return (case when r < 2 then 0 else 11 - r end) = substr(c, 14, 1)::int;
end $$;

create table if not exists public.reseller_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text not null check (length(btrim(company_name)) between 2 and 200),
  trade_name text check (trade_name is null or length(trade_name) <= 200),
  cnpj text not null unique check (public.is_valid_cnpj(cnpj) and cnpj ~ '^\d{14}$'),
  state_registration text not null check (state_registration = 'ISENTO' or state_registration ~ '^\d{8,14}$'),
  uf char(2) not null check (uf in ('AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO')),
  responsible_name text not null check (length(btrim(responsible_name)) between 2 and 120),
  email text not null check (length(email) <= 255),
  phone text not null check (phone ~ '^\d{10,11}$'),
  status public.reseller_status not null default 'pendente',
  review_note text check (review_note is null or length(review_note) <= 1000),
  documents_confirmed boolean not null default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rejection_needs_reason check (status <> 'rejeitado' or length(btrim(coalesce(review_note, ''))) >= 5),
  constraint docs_request_needs_note check (status <> 'documentacao_solicitada' or length(btrim(coalesce(review_note, ''))) >= 5),
  constraint approval_needs_docs check (status <> 'aprovado' or documents_confirmed)
);
create index if not exists reseller_applications_status_idx on public.reseller_applications (status, created_at);

grant select on public.reseller_applications to authenticated;
grant all on public.reseller_applications to service_role;
alter table public.reseller_applications enable row level security;

drop policy if exists "own application readable" on public.reseller_applications;
create policy "own application readable" on public.reseller_applications for select to authenticated using (user_id = auth.uid());
drop policy if exists "admins read applications" on public.reseller_applications;
create policy "admins read applications" on public.reseller_applications for select to authenticated using (public.has_role('admin'));

create or replace function public.handle_reseller_signup()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if m->>'registration_type' is distinct from 'revendedor' then return new; end if;
  insert into public.reseller_applications
    (user_id, company_name, trade_name, cnpj, state_registration, uf, responsible_name, email, phone)
  values (new.id, btrim(m->>'company_name'), nullif(btrim(m->>'trade_name'), ''),
    regexp_replace(coalesce(m->>'cnpj',''), '\D', '', 'g'),
    case when upper(btrim(coalesce(m->>'state_registration',''))) = 'ISENTO' then 'ISENTO'
         else regexp_replace(coalesce(m->>'state_registration',''), '\D', '', 'g') end,
    upper(coalesce(m->>'uf','')), btrim(coalesce(m->>'full_name','')), lower(new.email),
    regexp_replace(coalesce(m->>'phone',''), '\D', '', 'g'));
  return new;
end $$;
revoke all on function public.handle_reseller_signup() from public, anon, authenticated;
drop trigger if exists on_auth_user_reseller on auth.users;
create trigger on_auth_user_reseller after insert on auth.users for each row execute function public.handle_reseller_signup();

create or replace function public.review_reseller_application(
  p_id uuid, p_action text, p_note text default null, p_documents_confirmed boolean default false)
returns public.reseller_status language plpgsql security definer set search_path = pg_catalog, public as $$
declare a public.reseller_applications; s public.reseller_status;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'Apenas administradores podem revisar cadastros.' using errcode = '42501';
  end if;
  s := case p_action when 'aprovar' then 'aprovado' when 'rejeitar' then 'rejeitado'
       when 'solicitar_documentos' then 'documentacao_solicitada' end;
  if s is null then raise exception 'Ação inválida.' using errcode = '22023'; end if;
  if s = 'aprovado' and not coalesce(p_documents_confirmed, false) then
    raise exception 'Confirme a regularidade do CNPJ e da IE antes de aprovar.' using errcode = '23514';
  end if;
  if s <> 'aprovado' and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Informe a justificativa (mínimo 5 caracteres).' using errcode = '23514';
  end if;
  select * into a from public.reseller_applications where id = p_id for update;
  if not found then raise exception 'Cadastro não encontrado.' using errcode = 'P0002'; end if;
  if a.user_id = auth.uid() then raise exception 'Não é permitido revisar o próprio cadastro.' using errcode = '42501'; end if;
  update public.reseller_applications set status = s, review_note = nullif(btrim(p_note), ''),
    documents_confirmed = (s = 'aprovado'), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_id;
  if s = 'aprovado' then
    insert into public.user_roles (user_id, role)
    select a.user_id, 'revendedor'::public.app_role
    where not exists (select 1 from public.user_roles ur where ur.user_id = a.user_id and ur.role = 'revendedor'::public.app_role);
  else
    delete from public.user_roles where user_id = a.user_id and role = 'revendedor'::public.app_role;
  end if;
  return s;
end $$;
revoke all on function public.review_reseller_application(uuid, text, text, boolean) from public, anon;
grant execute on function public.review_reseller_application(uuid, text, text, boolean) to authenticated;

create or replace function public.resubmit_reseller_application(p_state_registration text, p_phone text)
returns public.reseller_status language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.reseller_applications set
    state_registration = case when upper(btrim(p_state_registration)) = 'ISENTO' then 'ISENTO'
                              else regexp_replace(p_state_registration, '\D', '', 'g') end,
    phone = regexp_replace(p_phone, '\D', '', 'g'),
    status = 'pendente', documents_confirmed = false, review_note = null, reviewed_by = null, reviewed_at = null, updated_at = now()
  where user_id = auth.uid() and status = 'documentacao_solicitada';
  if not found then raise exception 'Não há solicitação de documentação em aberto.' using errcode = '23514'; end if;
  return 'pendente';
end $$;
revoke all on function public.resubmit_reseller_application(text, text) from public, anon;
grant execute on function public.resubmit_reseller_application(text, text) to authenticated;

commit;
