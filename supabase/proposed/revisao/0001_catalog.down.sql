-- Reverte 0001 (v2). IRREVERSÍVEL: apaga TODOS os produtos, preços, specs, imagens,
-- metadados e papéis (inclusive o administrador). Faça backup antes, por exemplo:
--   pg_dump --data-only -t 'public.product*' -t public.user_roles > backup_0001.sql
-- Sem CASCADE: se algo criado depois depender destes objetos, o script para com erro
-- em vez de apagar esse objeto em silêncio.
begin;
drop table if exists public.product_images, public.product_specs, public.product_admin_meta,
  public.product_reseller_prices, public.product_prices, public.products;
drop function if exists public.tg_check_publishable(), public.tg_check_publishable_product(),
  public.tg_check_children(), public.tg_bump_version(), public.tg_products_meta(),
  public.tg_meta_authorship(), public.tg_freeze_product_id();
drop table if exists public.user_roles;
drop function if exists public.has_role(public.app_role);
drop type if exists public.product_status;
drop type if exists public.app_role;
commit;
