-- PROPOSTA: reverte apenas 0002; não apaga dados. Remove proteção agregada.
-- Não executar enquanto houver clientes usando save_product.
begin;
drop function public.save_product(uuid,integer,jsonb);
drop trigger specs_aggregate_lock on public.product_specs;
drop trigger images_aggregate_lock on public.product_images;
drop trigger prices_aggregate_lock on public.product_prices;
drop trigger reseller_aggregate_lock on public.product_reseller_prices;
drop trigger specs_aggregate_bump on public.product_specs;
drop trigger images_aggregate_bump on public.product_images;
drop trigger prices_aggregate_bump on public.product_prices;
drop trigger reseller_aggregate_bump on public.product_reseller_prices;
drop trigger prices_freeze on public.product_prices;
drop trigger reseller_freeze on public.product_reseller_prices;
drop function public.tg_lock_product_aggregate(), public.tg_bump_product_aggregate();
drop trigger prices_limits on public.product_prices;
drop trigger reseller_limits on public.product_reseller_prices;
create trigger prices_limits after insert or update on public.product_prices for each row execute function public.tg_check_children();
create trigger reseller_limits after insert or update on public.product_reseller_prices for each row execute function public.tg_check_children();
create or replace function public.tg_check_publishable_product() returns trigger
language plpgsql security definer set search_path = public as $$
declare missing text[] := '{}';
begin
  if new.status <> 'published' then return null; end if;
  if new.sku is null then missing := array_append(missing, 'sku'); end if;
  if new.category is null then missing := array_append(missing, 'category'); end if;
  if not exists (select 1 from public.product_images where product_id = new.id) then missing := array_append(missing, 'images'); end if;
  if not exists (select 1 from public.product_prices where product_id = new.id and customer_price > 0) then missing := array_append(missing, 'customerPrice'); end if;
  if not exists (select 1 from public.product_reseller_prices where product_id = new.id and reseller_price > 0) then missing := array_append(missing, 'resellerPrice'); end if;
  if array_length(missing, 1) > 0 then
    raise exception 'Produto publicado incompleto: %', array_to_string(missing, ', ') using errcode = 'check_violation'; end if;
  return null;
end $$;

-- USAGE preservado: também é necessário para INSERT administrativo da 0001.
-- EXECUTE do trigger de integridade continua revogado (não é uma RPC).
commit;
