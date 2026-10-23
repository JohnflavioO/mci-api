begin;
drop policy if exists "reseller reads published reseller prices" on public.product_reseller_prices;
drop function if exists public.set_product_stock(uuid, integer);
drop function if exists public.confirm_sale_stock(jsonb);
-- Atenção: remover a coluna apaga os estoques informados.
alter table public.products drop column if exists stock_quantity;
commit;
