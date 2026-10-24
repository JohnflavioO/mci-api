-- Reverte somente a configuração de confirmação; preserve a coluna/quantidades da migration 0004.
begin;
drop function if exists public.set_stock_confirmation_mode(boolean);
drop function if exists public.set_product_stock(uuid, integer, boolean);
create or replace function public.set_product_stock(p_id uuid, p_stock integer)
returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if not public.has_role('admin') then raise exception 'acesso restrito' using errcode = '42501'; end if;
  if p_stock is not null and p_stock < 0 then raise exception 'estoque negativo' using errcode = '22023'; end if;
  update public.products set stock_quantity = p_stock where id = p_id;
  if not found then raise exception 'produto não encontrado' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.set_product_stock(uuid, integer) from public, anon;
grant execute on function public.set_product_stock(uuid, integer) to authenticated;
drop policy if exists "public reads stock confirmation setting" on public.platform_settings;
drop policy if exists "admins manage platform settings" on public.platform_settings;
drop table if exists public.platform_settings;
alter table public.products drop column if exists stock_confirmed;
commit;
