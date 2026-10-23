begin;
drop function if exists public.confirm_sale_stock(jsonb);
alter table public.products drop column if exists stock_quantity;
commit;
