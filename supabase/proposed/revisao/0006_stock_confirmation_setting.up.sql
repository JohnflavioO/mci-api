-- 0006 (PROPOSTA, NÃO APLICADA): confirmação manual de estoque.
-- Pré-requisito: migrations propostas 0001–0004 aplicadas e validadas.
begin;

alter table public.products
  add column stock_confirmed boolean not null default false;

create table public.platform_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.platform_settings enable row level security;

insert into public.platform_settings(setting_key, setting_value)
values ('manual_stock_confirmation', '{"enabled": true}'::jsonb)
on conflict (setting_key) do nothing;

create policy "admins manage platform settings" on public.platform_settings
  for all to authenticated
  using (public.has_role('admin'::public.app_role))
  with check (public.has_role('admin'::public.app_role));

-- Visitantes só podem ler a configuração pública específica, nunca outras configurações.
create policy "public reads stock confirmation setting" on public.platform_settings
  for select to anon, authenticated
  using (setting_key = 'manual_stock_confirmation');

create or replace function public.set_stock_confirmation_mode(p_enabled boolean)
returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not public.has_role('admin'::public.app_role) then
    raise exception 'Apenas administradores podem alterar esta configuração.' using errcode = '42501';
  end if;
  insert into public.platform_settings(setting_key, setting_value, updated_at, updated_by)
  values ('manual_stock_confirmation', jsonb_build_object('enabled', p_enabled), now(), auth.uid())
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value, updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.set_stock_confirmation_mode(boolean) from public, anon;
grant execute on function public.set_stock_confirmation_mode(boolean) to authenticated;

-- A confirmação só pode ser marcada explicitamente por um administrador.
create or replace function public.set_product_stock(p_id uuid, p_stock integer, p_confirmed boolean default false)
returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not public.has_role('admin'::public.app_role) then
    raise exception 'Apenas administradores podem atualizar estoque.' using errcode = '42501';
  end if;
  if p_stock is not null and p_stock < 0 then
    raise exception 'Estoque negativo' using errcode = '22023';
  end if;
  if p_confirmed and (p_stock is null or p_stock <= 0) then
    raise exception 'Só é possível confirmar estoque com quantidade maior que zero.' using errcode = '23514';
  end if;
  update public.products
     set stock_quantity = p_stock,
         stock_confirmed = coalesce(p_confirmed, false)
   where id = p_id;
  if not found then raise exception 'Produto não encontrado' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.set_product_stock(uuid, integer, boolean) from public, anon;
grant execute on function public.set_product_stock(uuid, integer, boolean) to authenticated;

-- Produtos importados não herdam confirmação: default false.
commit;
