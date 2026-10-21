-- Reverte 0001. ATENÇÃO: apaga TODOS os produtos, preços, specs, imagens e papéis.
-- Não há reversão sem perda de dados: faça backup antes (pg_dump das tabelas abaixo).
begin;
drop table if exists public.product_images, public.product_specs,
  public.product_reseller_prices, public.product_prices, public.products cascade;
drop function if exists public.tg_check_publishable(), public.tg_check_publishable_product(),
  public.tg_check_children(), public.tg_bump_version(), public.tg_products_defaults();
drop table if exists public.user_roles cascade;
drop function if exists public.has_role(uuid, public.app_role);
drop type if exists public.product_status;
drop type if exists public.app_role;
commit;
