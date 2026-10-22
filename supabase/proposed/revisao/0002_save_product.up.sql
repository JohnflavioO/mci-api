-- PROPOSTA NÃO EXECUTADA NO SUPABASE. Requer 0001 revisada (v2).
-- Snapshot completo: arrays vazios removem filhos; null/null cria, UUID/versão atualiza.
begin;

-- Antes de qualquer escrita em filhos, trava o agregado. SECURITY INVOKER:
-- usa os mesmos GRANT/RLS de admin já definidos na 0001.
create function public.tg_lock_product_aggregate() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  perform 1 from public.products where id = coalesce(new.product_id, old.product_id) for update;
  return coalesce(new, old);
end $$;
create function public.tg_bump_product_aggregate() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  -- products_bump e products_meta da 0001 atualizam versão, data e autoria.
  update public.products set updated_at = now() where id = coalesce(new.product_id, old.product_id);
  return null;
end $$;

create trigger specs_aggregate_lock before insert or update or delete on public.product_specs for each row execute function public.tg_lock_product_aggregate();
create trigger images_aggregate_lock before insert or update or delete on public.product_images for each row execute function public.tg_lock_product_aggregate();
create trigger prices_aggregate_lock before insert or update or delete on public.product_prices for each row execute function public.tg_lock_product_aggregate();
create trigger reseller_aggregate_lock before insert or update or delete on public.product_reseller_prices for each row execute function public.tg_lock_product_aggregate();
create trigger specs_aggregate_bump after insert or update or delete on public.product_specs for each row execute function public.tg_bump_product_aggregate();
create trigger images_aggregate_bump after insert or update or delete on public.product_images for each row execute function public.tg_bump_product_aggregate();
create trigger prices_aggregate_bump after insert or update or delete on public.product_prices for each row execute function public.tg_bump_product_aggregate();
create trigger reseller_aggregate_bump after insert or update or delete on public.product_reseller_prices for each row execute function public.tg_bump_product_aggregate();
create trigger prices_freeze before update of product_id on public.product_prices for each row execute function public.tg_freeze_product_id();
create trigger reseller_freeze before update of product_id on public.product_reseller_prices for each row execute function public.tg_freeze_product_id();

-- Relação entre preços precisa avaliar o estado FINAL (subir/descer ambos é válido).
-- Quantidades de specs/imagens continuam verificadas imediatamente pela 0001.
drop trigger prices_limits on public.product_prices;
drop trigger reseller_limits on public.product_reseller_prices;
create constraint trigger prices_limits after insert or update or delete on public.product_prices
  deferrable initially deferred for each row execute function public.tg_check_children();
create constraint trigger reseller_limits after insert or update or delete on public.product_reseller_prices
  deferrable initially deferred for each row execute function public.tg_check_children();

-- Wrapper antigo inspecionava NEW de cada evento, inclusive estado intermediário.
-- A checagem adiada deve consultar a linha final, inclusive após múltiplos updates.
create or replace function public.tg_check_publishable_product() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare p public.products; missing text[] := '{}';
begin
  select * into p from public.products where id = new.id;
  if p.id is null or p.status <> 'published' then return null; end if;
  if p.sku is null then missing := array_append(missing, 'sku'); end if;
  if p.category is null then missing := array_append(missing, 'category'); end if;
  if not exists(select 1 from public.product_images where product_id = p.id) then missing := array_append(missing, 'images'); end if;
  if not exists(select 1 from public.product_prices where product_id = p.id and customer_price > 0) then missing := array_append(missing, 'customerPrice'); end if;
  if not exists(select 1 from public.product_reseller_prices where product_id = p.id and reseller_price > 0) then missing := array_append(missing, 'resellerPrice'); end if;
  if cardinality(missing) > 0 then raise exception 'Produto publicado incompleto: %', array_to_string(missing, ', ') using errcode = '23514'; end if;
  return null;
end $$;
-- Definer preservado apenas no trigger de integridade da 0001, que precisa ler
-- preço privado mesmo quando chamado por manutenção privilegiada. Não é RPC.
revoke all on function public.tg_check_publishable_product() from public, anon, authenticated;
revoke all on function public.tg_lock_product_aggregate(), public.tg_bump_product_aggregate() from public, anon, authenticated;

create function public.save_product(p_id uuid, p_expected_row_version integer, p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  pid uuid; version integer; k text; item jsonb; c numeric; r numeric;
  st public.product_status;
begin
  if auth.uid() is null or not public.has_role('admin'::public.app_role) then
    raise exception 'Apenas administradores autenticados podem salvar produtos.' using errcode = '42501';
  end if;
  if (p_id is null) <> (p_expected_row_version is null) or p_expected_row_version < 1 then
    raise exception 'Criação exige ID e versão nulos; atualização exige ID e row_version >= 1.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Produto deve ser um objeto JSON.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_data) loop
    if k <> all(array['name','brand','sku','category','description','status','pricing','images','specs']) then
      raise exception 'Campo não permitido: %', k using errcode = '22023';
    end if;
  end loop;
  foreach k in array array['name','brand','status'] loop
    if jsonb_typeof(p_data->k) is distinct from 'string' then raise exception 'Campo obrigatório de texto: %', k using errcode = '22023'; end if;
  end loop;
  foreach k in array array['sku','category','description'] loop
    if not (p_data ? k) or jsonb_typeof(p_data->k) not in ('string','null') then raise exception 'Campo obrigatório (texto ou null): %', k using errcode = '22023'; end if;
  end loop;
  if (p_data->>'status') not in ('draft','published') then raise exception 'Status inválido.' using errcode = '22023'; end if;
  st := (p_data->>'status')::public.product_status;
  if jsonb_typeof(p_data->'pricing') is distinct from 'object' or p_data->'pricing'->>'currency' is distinct from 'BRL'
    or ((p_data->'pricing') - array['currency','customerPrice','resellerPrice']) <> '{}'::jsonb then
    raise exception 'Preços exigem currency BRL, customerPrice e resellerPrice.' using errcode = '22023';
  end if;
  foreach k in array array['customerPrice','resellerPrice'] loop
    if not (p_data->'pricing' ? k) or jsonb_typeof(p_data->'pricing'->k) not in ('number','null') then raise exception 'Preço deve ser número ou null: %', k using errcode = '22023'; end if;
    if jsonb_typeof(p_data->'pricing'->k) = 'number' and ((p_data->'pricing'->>k)::numeric < 0 or (p_data->'pricing'->>k)::numeric > 9999999999.99 or (p_data->'pricing'->>k)::numeric <> round((p_data->'pricing'->>k)::numeric, 2)) then
      raise exception 'Preço inválido: % (0 a 9999999999.99, até duas casas decimais).', k using errcode = '23514';
    end if;
  end loop;
  c := (p_data->'pricing'->>'customerPrice')::numeric;
  r := (p_data->'pricing'->>'resellerPrice')::numeric;
  if r > c then raise exception 'Preço de revenda maior que o preço ao cliente.' using errcode = '23514'; end if;
  foreach k in array array['images','specs'] loop
    if jsonb_typeof(p_data->k) is distinct from 'array' then raise exception 'Campo obrigatório de lista: %', k using errcode = '22023'; end if;
  end loop;
  if jsonb_array_length(p_data->'images') > 20 then raise exception 'Máximo de 20 imagens.' using errcode = '23514'; end if;
  if jsonb_array_length(p_data->'specs') > 100 then raise exception 'Máximo de 100 especificações.' using errcode = '23514'; end if;
  for item in select value from jsonb_array_elements(p_data->'images') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'url') is distinct from 'string' or jsonb_typeof(item->'position') is distinct from 'number'
      or (item - array['url','position']) <> '{}'::jsonb then raise exception 'Imagem inválida.' using errcode = '22023'; end if;
    if (item->>'position')::numeric < 0 or (item->>'position')::numeric > 2147483647 or (item->>'position')::numeric <> trunc((item->>'position')::numeric) then raise exception 'Posição deve ser inteiro não negativo.' using errcode = '23514'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_data->'specs') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'value') is distinct from 'string'
      or (item - array['label','value']) <> '{}'::jsonb then raise exception 'Especificação inválida.' using errcode = '22023'; end if;
  end loop;
  if st = 'published' and (nullif(btrim(p_data->>'sku'),'') is null or nullif(btrim(p_data->>'category'),'') is null
    or jsonb_array_length(p_data->'images') = 0 or coalesce(c,0) <= 0 or coalesce(r,0) <= 0) then
    raise exception 'Produto publicado exige SKU, categoria, imagem e ambos os preços maiores que zero.' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.products(name,brand,sku,category,description,status)
      values(btrim(p_data->>'name'),btrim(p_data->>'brand'),nullif(btrim(p_data->>'sku'),''),nullif(btrim(p_data->>'category'),''),p_data->>'description',st)
      returning id into pid;
  else
    -- Ordem de travas igual à de UPDATE/DELETE direto em filho (linha filha -> produto).
    -- Travar o produto primeiro causava deadlock (40P01) com sessão que já segurava
    -- uma linha filha existente. Ordem fixa: specs, imagens, preço, revenda, produto.
    perform 1 from public.product_specs where product_id = p_id order by id for update;
    perform 1 from public.product_images where product_id = p_id order by id for update;
    perform 1 from public.product_prices where product_id = p_id for update;
    perform 1 from public.product_reseller_prices where product_id = p_id for update;
    select row_version into version from public.products where id = p_id for update;
    if not found then raise exception 'Produto não encontrado.' using errcode = 'P0002'; end if;
    if version <> p_expected_row_version then raise exception 'Conflito de versão: produto alterado por outra pessoa. Recarregue.' using errcode = '40001', detail = format('expected=%s, current=%s',p_expected_row_version,version); end if;
    pid := p_id;
    update public.products set name=btrim(p_data->>'name'),brand=btrim(p_data->>'brand'),sku=nullif(btrim(p_data->>'sku'),''),
      category=nullif(btrim(p_data->>'category'),''),description=p_data->>'description',status=st where id=pid;
  end if;
  -- Todas as exclusões/inserções participam da mesma transação da chamada RPC.
  delete from public.product_specs where product_id=pid;
  delete from public.product_images where product_id=pid;
  insert into public.product_prices(product_id,currency,customer_price) values(pid,'BRL',c)
    on conflict(product_id) do update set currency=excluded.currency,customer_price=excluded.customer_price;
  insert into public.product_reseller_prices(product_id,reseller_price) values(pid,r)
    on conflict(product_id) do update set reseller_price=excluded.reseller_price;
  insert into public.product_images(product_id,url,position)
    select pid,btrim(x.url),x.position from jsonb_to_recordset(p_data->'images') as x(url text,position integer);
  insert into public.product_specs(product_id,label,value)
    select pid,btrim(x.label),btrim(x.value) from jsonb_to_recordset(p_data->'specs') as x(label text,value text);
  select row_version into version from public.products where id=pid;
  return jsonb_build_object('id',pid,'rowVersion',version);
exception when unique_violation then
  -- Mantém o SQLSTATE; não expõe valores do registro que causou duplicidade.
  raise exception 'SKU, posição de imagem ou rótulo de especificação duplicado.' using errcode = '23505';
end $$;
revoke all on function public.save_product(uuid,integer,jsonb) from public, anon, service_role;
grant execute on function public.save_product(uuid,integer,jsonb) to authenticated;
-- Identity das tabelas filhas: necessário para INSERT com SECURITY INVOKER.
grant usage on sequence public.product_images_id_seq, public.product_specs_id_seq to authenticated;
commit;
