-- 0004 (PROPOSTA, NÃO APLICADA): estoque de produtos.
-- Produtos existentes ficam com stock_quantity NULL ("não informado"): nada é zerado.
begin;

alter table public.products
  add column stock_quantity integer check (stock_quantity is null or stock_quantity >= 0);

-- Baixa atômica após venda confirmada: trava cada produto em ordem de id (evita deadlock),
-- rejeita estoque insuficiente e desfaz tudo em caso de erro. Só admin (ou futura rotina de pedidos).
create or replace function public.confirm_sale_stock(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare r record;
begin
  if not public.has_role('admin') then
    raise exception 'acesso restrito' using errcode = '42501';
  end if;
  for r in
    select (e->>'product_id')::uuid as id, (e->>'qty')::int as qty
    from jsonb_array_elements(p_items) e order by 1
  loop
    if r.qty is null or r.qty < 1 then
      raise exception 'quantidade inválida' using errcode = '22023';
    end if;
    update public.products
       set stock_quantity = stock_quantity - r.qty
     where id = r.id and stock_quantity is not null and stock_quantity >= r.qty;
    if not found then
      raise exception 'estoque insuficiente para %', r.id using errcode = '23514';
    end if;
  end loop;
end $$;

revoke all on function public.confirm_sale_stock(jsonb) from public, anon;
grant execute on function public.confirm_sale_stock(jsonb) to authenticated;

-- Admin define o estoque (NULL = não informado). Atualiza row_version via trigger existente.
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

-- Revendedor aprovado (papel concedido só por review_reseller_application) lê o preço
-- de revenda de produtos publicados. anon continua sem GRANT; clientes/afiliados não passam no RLS.
create policy "reseller reads published reseller prices" on public.product_reseller_prices
  for select to authenticated
  using (public.has_role('revendedor') and exists (
    select 1 from public.products p where p.id = product_id and p.status = 'published'));

commit;
