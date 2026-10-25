begin;

create table if not exists public.reseller_change_requests (
  id uuid primary key default gen_random_uuid(),
  reseller_application_id uuid not null references public.reseller_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_fields text[] not null,
  current_values jsonb not null default '{}'::jsonb,
  proposed_values jsonb not null,
  reason text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovada','rejeitada')),
  admin_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reseller_change_requests_reason_check check (length(btrim(reason)) >= 10 and length(reason) <= 1000),
  constraint reseller_change_requests_fields_check check (cardinality(requested_fields) > 0)
);

create index if not exists reseller_change_requests_status_created_idx
  on public.reseller_change_requests(status, created_at desc);
create index if not exists reseller_change_requests_user_created_idx
  on public.reseller_change_requests(user_id, created_at desc);

alter table public.reseller_change_requests enable row level security;

drop policy if exists "Resellers read own change requests" on public.reseller_change_requests;
create policy "Resellers read own change requests"
on public.reseller_change_requests for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins read reseller change requests" on public.reseller_change_requests;
create policy "Admins read reseller change requests"
on public.reseller_change_requests for select to authenticated
using (public.has_role('admin'::public.app_role));

drop policy if exists "Admins update reseller change requests" on public.reseller_change_requests;
create policy "Admins update reseller change requests"
on public.reseller_change_requests for update to authenticated
using (public.has_role('admin'::public.app_role))
with check (public.has_role('admin'::public.app_role));

revoke all on public.reseller_change_requests from anon, public;
grant select on public.reseller_change_requests to authenticated;
grant update (status, admin_note, reviewed_by, reviewed_at, updated_at) on public.reseller_change_requests to authenticated;

create or replace function public.submit_reseller_change_request(
  p_requested_fields text[],
  p_proposed_values jsonb,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_application public.reseller_applications;
  v_current jsonb;
  v_allowed constant text[] := array['company_name','trade_name','cnpj','state_registration','uf','responsible_name'];
  v_key text;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_requested_fields is null or cardinality(p_requested_fields) = 0 then
    raise exception 'Selecione ao menos um campo para alteração.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 10 or length(p_reason) > 1000 then
    raise exception 'Informe o motivo da solicitação (10 a 1000 caracteres).' using errcode = '22023';
  end if;
  if p_proposed_values is null or jsonb_typeof(p_proposed_values) <> 'object' then
    raise exception 'Valores propostos inválidos.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_requested_fields) f where not (f = any(v_allowed))) then
    raise exception 'A solicitação contém campos não permitidos.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_requested_fields) f where not (p_proposed_values ? f)) then
    raise exception 'Informe o novo valor de todos os campos selecionados.' using errcode = '22023';
  end if;

  select * into v_application
  from public.reseller_applications
  where user_id = v_user_id
  for update;
  if not found then
    raise exception 'Cadastro de revendedor não encontrado.' using errcode = 'P0002';
  end if;

  v_current := jsonb_build_object(
    'company_name', v_application.company_name,
    'trade_name', v_application.trade_name,
    'cnpj', v_application.cnpj,
    'state_registration', v_application.state_registration,
    'uf', v_application.uf,
    'responsible_name', v_application.responsible_name
  );

  foreach v_key in array p_requested_fields loop
    if coalesce(p_proposed_values ->> v_key, '') = '' then
      raise exception 'O novo valor de cada campo solicitado é obrigatório.' using errcode = '22023';
    end if;
  end loop;

  insert into public.reseller_change_requests (
    reseller_application_id, user_id, requested_fields, current_values, proposed_values, reason
  ) values (
    v_application.id, v_user_id, p_requested_fields, v_current, p_proposed_values, btrim(p_reason)
  ) returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.submit_reseller_change_request(text[], jsonb, text) from public, anon;
grant execute on function public.submit_reseller_change_request(text[], jsonb, text) to authenticated;


create or replace function public.review_reseller_change_request(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_request public.reseller_change_requests;
  v_status text;
begin
  if auth.uid() is null or not public.has_role('admin'::public.app_role) then
    raise exception 'Acesso restrito ao Super Admin.' using errcode = '42501';
  end if;
  if p_action not in ('aprovar','rejeitar') then
    raise exception 'Ação inválida.' using errcode = '22023';
  end if;
  if p_action = 'rejeitar' and length(btrim(coalesce(p_admin_note,''))) < 5 then
    raise exception 'Informe a justificativa da rejeição (mínimo 5 caracteres).' using errcode = '22023';
  end if;

  select * into v_request from public.reseller_change_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitação não encontrada.' using errcode = 'P0002'; end if;
  if v_request.status <> 'pendente' then raise exception 'Esta solicitação já foi analisada.' using errcode = '23514'; end if;

  if p_action = 'aprovar' then
    update public.reseller_applications a
       set company_name = case when v_request.requested_fields @> array['company_name'] then v_request.proposed_values ->> 'company_name' else a.company_name end,
           trade_name = case when v_request.requested_fields @> array['trade_name'] then nullif(v_request.proposed_values ->> 'trade_name','') else a.trade_name end,
           cnpj = case when v_request.requested_fields @> array['cnpj'] then regexp_replace(v_request.proposed_values ->> 'cnpj','\\D','','g') else a.cnpj end,
           state_registration = case when v_request.requested_fields @> array['state_registration'] then case when upper(btrim(v_request.proposed_values ->> 'state_registration')) = 'ISENTO' then 'ISENTO' else regexp_replace(v_request.proposed_values ->> 'state_registration','\\D','','g') end else a.state_registration end,
           uf = case when v_request.requested_fields @> array['uf'] then upper(btrim(v_request.proposed_values ->> 'uf')) else a.uf end,
           responsible_name = case when v_request.requested_fields @> array['responsible_name'] then btrim(v_request.proposed_values ->> 'responsible_name') else a.responsible_name end,
           updated_at = now()
     where a.id = v_request.reseller_application_id;
    if not found then raise exception 'Cadastro comercial não encontrado.' using errcode = 'P0002'; end if;
    v_status := 'aprovada';
  else
    v_status := 'rejeitada';
  end if;

  update public.reseller_change_requests
     set status = v_status, admin_note = nullif(btrim(coalesce(p_admin_note,'')), ''),
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_request_id;
  return v_status;
end;
$function$;

revoke all on function public.review_reseller_change_request(uuid, text, text) from public, anon;
grant execute on function public.review_reseller_change_request(uuid, text, text) to authenticated;

commit;
