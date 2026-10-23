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
  if not public.has_role(auth.uid(), 'admin') then
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

commit;
-- Pendente: incluir stock_quantity no snapshot de save_product (0002) e no formulário admin.
