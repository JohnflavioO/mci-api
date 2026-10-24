-- MCI Xpress: reseller account profile and self-service application completion.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Users can upload their own profile photo" on storage.objects;
create policy "Users can upload their own profile photo"
on storage.objects for insert to authenticated
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own profile photo" on storage.objects;
create policy "Users can update their own profile photo"
on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Profile photos are publicly readable" on storage.objects;
create policy "Profile photos are publicly readable"
on storage.objects for select to public using (bucket_id = 'profile-photos');

create or replace function public.submit_my_reseller_application(
  p_company_name text, p_trade_name text, p_cnpj text, p_state_registration text,
  p_uf text, p_responsible_name text, p_phone text
) returns public.reseller_status
language plpgsql security definer set search_path = pg_catalog, public as $$
declare u auth.users; current_app public.reseller_applications; clean_cnpj text; clean_phone text; result public.reseller_status;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para concluir o cadastro.' using errcode = '42501'; end if;
  select * into u from auth.users where id = auth.uid();
  clean_cnpj := regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g');
  clean_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  if length(btrim(coalesce(p_company_name,''))) < 2 or length(btrim(coalesce(p_responsible_name,''))) < 2
     or length(clean_cnpj) <> 14 or not public.is_valid_cnpj(clean_cnpj)
     or (upper(btrim(coalesce(p_state_registration,''))) <> 'ISENTO' and length(regexp_replace(p_state_registration, '\D', '', 'g')) not between 8 and 14)
     or upper(coalesce(p_uf,'')) not in ('AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO')
     or length(clean_phone) not in (10,11) then
    raise exception 'Revise os dados: razão social, responsável, CNPJ válido, inscrição estadual, UF e telefone são obrigatórios.' using errcode = '23514';
  end if;
  select * into current_app from public.reseller_applications where user_id = auth.uid() for update;
  if found then
    if current_app.status = 'aprovado' then raise exception 'O cadastro aprovado deve ser alterado com apoio da equipe MCI.' using errcode = '23514'; end if;
    update public.reseller_applications set company_name = btrim(p_company_name), trade_name = nullif(btrim(coalesce(p_trade_name,'')), ''),
      state_registration = case when upper(btrim(p_state_registration)) = 'ISENTO' then 'ISENTO' else regexp_replace(p_state_registration, '\D', '', 'g') end,
      uf = upper(btrim(p_uf)), responsible_name = btrim(p_responsible_name), phone = clean_phone,
      status = 'pendente', review_note = null, reviewed_by = null, reviewed_at = null, updated_at = now()
      where user_id = auth.uid() returning status into result;
  else
    insert into public.reseller_applications (user_id, company_name, trade_name, cnpj, state_registration, uf, responsible_name, email, phone)
    values (auth.uid(), btrim(p_company_name), nullif(btrim(coalesce(p_trade_name,'')), ''), clean_cnpj,
      case when upper(btrim(p_state_registration)) = 'ISENTO' then 'ISENTO' else regexp_replace(p_state_registration, '\D', '', 'g') end,
      upper(btrim(p_uf)), btrim(p_responsible_name), lower(u.email), clean_phone)
    returning status into result;
  end if;
  return result;
end $$;
revoke all on function public.submit_my_reseller_application(text,text,text,text,text,text,text) from public, anon;
grant execute on function public.submit_my_reseller_application(text,text,text,text,text,text,text) to authenticated;

create or replace function public.update_my_reseller_profile(
  p_company_name text, p_trade_name text, p_state_registration text, p_uf text,
  p_responsible_name text, p_phone text
) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare a public.reseller_applications; clean_phone text;
begin
  if auth.uid() is null then raise exception 'Não autenticado.' using errcode = '42501'; end if;
  clean_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  select * into a from public.reseller_applications where user_id = auth.uid() for update;
  if not found then raise exception 'Inscrição de revendedor não encontrada.' using errcode = 'P0002'; end if;
  if a.status = 'aprovado' then raise exception 'Para alterar os dados comerciais de um cadastro aprovado, contate a equipe MCI.' using errcode = '23514'; end if;
  if length(btrim(coalesce(p_company_name,''))) < 2 or length(btrim(coalesce(p_responsible_name,''))) < 2
     or (upper(btrim(coalesce(p_state_registration,''))) <> 'ISENTO' and length(regexp_replace(p_state_registration, '\D', '', 'g')) not between 8 and 14)
     or upper(coalesce(p_uf,'')) not in ('AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO')
     or length(clean_phone) not in (10,11) then raise exception 'Revise os campos obrigatórios.' using errcode = '23514'; end if;
  update public.reseller_applications set company_name = btrim(p_company_name), trade_name = nullif(btrim(coalesce(p_trade_name,'')), ''),
    state_registration = case when upper(btrim(p_state_registration)) = 'ISENTO' then 'ISENTO' else regexp_replace(p_state_registration, '\D', '', 'g') end,
    uf = upper(btrim(p_uf)), responsible_name = btrim(p_responsible_name), phone = clean_phone, updated_at = now()
    where user_id = auth.uid();
end $$;
revoke all on function public.update_my_reseller_profile(text,text,text,text,text,text) from public, anon;
grant execute on function public.update_my_reseller_profile(text,text,text,text,text,text) to authenticated;
commit;
