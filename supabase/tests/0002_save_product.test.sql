\set ON_ERROR_STOP on
create schema test;
create function test.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function test.payload(sku text default 'BASE') returns jsonb language sql as $$
select jsonb_build_object('name','Produto teste','brand','','sku',sku,'category','Iluminação','description',null,'status','published',
'pricing',jsonb_build_object('currency','BRL','customerPrice',100,'resellerPrice',70),
'images',jsonb_build_array(jsonb_build_object('url','https://example.test/item.jpg','position',0)),
'specs',jsonb_build_array(jsonb_build_object('label','Potência','value','100 W'))) $$;
create function test.reject(payload jsonb, code text, label text, pid uuid default null, version integer default null) returns void language plpgsql as $$
begin
  begin
    perform public.save_product(pid,version,payload);
  exception when others then
    if sqlstate <> code then raise exception 'FAIL: % expected %, got %: %',label,code,sqlstate,sqlerrm; end if;
    raise notice 'PASS: %',label; return;
  end;
  raise exception 'FAIL: % did not reject',label;
end $$;
grant usage on schema test to authenticated, anon;
grant execute on all functions in schema test to authenticated, anon;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.user_roles(user_id,role) values ('00000000-0000-0000-0000-000000000001','admin');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.save_product(null,null,test.payload()) as saved \gset
select (:'saved'::jsonb->>'id') as pid, (:'saved'::jsonb->>'rowVersion')::integer as ver \gset
select test.assert((select name='Produto teste' and status='published' and row_version=:ver from public.products where id=:'pid'), 'gravação completa produto/versão');
select test.assert((select customer_price=100 from public.product_prices where product_id=:'pid'), 'preço cliente 100');
select test.assert((select reseller_price=70 from public.product_reseller_prices where product_id=:'pid'), 'preço revenda 70');
select test.assert((select count(*)=1 from public.product_images where product_id=:'pid') and (select count(*)=1 from public.product_specs where product_id=:'pid'), 'imagens e specs gravadas');
select test.reject(test.payload('INVALID') || '{"images":[]}', '23514','publicação sem imagem');
select test.reject(test.payload('INVALID') || '{"sku":null}', '23514','publicação sem SKU');
select test.reject(test.payload('INVALID') || '{"category":null}', '23514','publicação sem categoria');
select test.reject(jsonb_set(test.payload('INVALID'),'{pricing,resellerPrice}','0'), '23514','publicação revenda zero');
select test.reject(jsonb_set(test.payload('INVALID'),'{pricing,customerPrice}','0'), '23514','publicação cliente zero');
select test.reject(jsonb_set(test.payload(),'{pricing,resellerPrice}','101'), '23514','revenda maior que cliente');
select test.reject(jsonb_set(test.payload(),'{pricing,customerPrice}','-1'), '23514','preço negativo');
select test.reject(jsonb_set(test.payload(),'{pricing,customerPrice}','100.001'), '23514','fração de centavo rejeitada');
select test.reject(jsonb_set(test.payload(),'{pricing,customerPrice}','10000000000'), '23514','limite monetário');
select test.reject(test.payload(' base '), '23505','SKU normalizado duplicado');
select test.reject(test.payload(), '22023','ID sem versão', :'pid',null);
select test.reject(test.payload(), '22023','versão sem ID',null,1);
select test.reject(test.payload(),'P0002','ID inexistente','00000000-0000-0000-0000-000000000099',1);
-- Falha DEPOIS de atualizar produto e preços: restrição HTTPS da tabela.
select test.reject(jsonb_set(test.payload(),'{images,0,url}','"http://invalid.test"'),'23514','rollback após escritas',:'pid',:ver);
select test.assert((select row_version=:ver and name='Produto teste' from public.products where id=:'pid') and (select count(*)=1 from public.product_images where product_id=:'pid'), 'rollback mantém versão e filhos');
select test.reject(jsonb_set(test.payload('NEWFAIL'),'{images,0,url}','"http://invalid.test"'),'23514','rollback criação');
select test.assert(not exists(select 1 from public.products where sku='NEWFAIL'),'rollback não deixa produto parcial');
select test.reject(jsonb_set(test.payload(),'{images}',(select jsonb_agg(jsonb_build_object('url','https://example.test/a','position',i)) from generate_series(0,20) i)), '23514','limite 20 imagens');
select test.reject(jsonb_set(test.payload(),'{specs}',(select jsonb_agg(jsonb_build_object('label','L'||i,'value','V')) from generate_series(1,101) i)), '23514','limite 100 specs');
select test.reject(test.payload() || '{"specs":[{"label":"A","value":"1"},{"label":"a","value":"2"}]}', '23505','rótulo repetido');
select test.reject(test.payload() || '{"images":[{"url":"https://example.test/1","position":0},{"url":"https://example.test/2","position":0}]}', '23505','posição repetida');
-- Atualização válida que falharia na checagem imediata de preços antiga.
select public.save_product(:'pid',:ver,jsonb_set(jsonb_set(test.payload(),'{pricing,customerPrice}','50'),'{pricing,resellerPrice}','40')) as saved \gset
select (:'saved'::jsonb->>'rowVersion')::integer as nextver \gset
select test.assert(:nextver > :ver,'versão avança no snapshot completo');
select test.reject(test.payload(),'40001','snapshot desatualizado',:'pid',:ver);
select public.save_product(:'pid',:nextver,jsonb_set(jsonb_set(test.payload(),'{pricing,customerPrice}','200'),'{pricing,resellerPrice}','150')) as saved \gset
select (:'saved'::jsonb->>'rowVersion')::integer as before_direct \gset
update public.product_specs set value='200 W' where product_id=:'pid';
select test.assert((select row_version > :before_direct from public.products where id=:'pid'),'spec direta avança versão');
select test.reject(test.payload(),'40001','spec direta invalida snapshot',:'pid',:before_direct);
select row_version as before_direct from public.products where id=:'pid' \gset
update public.product_images set url='https://example.test/new.jpg' where product_id=:'pid';
select test.assert((select row_version > :before_direct from public.products where id=:'pid'),'imagem direta avança versão');
select row_version as before_direct from public.products where id=:'pid' \gset
update public.product_prices set customer_price=220 where product_id=:'pid';
select test.assert((select row_version > :before_direct from public.products where id=:'pid'),'preço cliente direto avança versão');
select row_version as before_direct from public.products where id=:'pid' \gset
update public.product_reseller_prices set reseller_price=160 where product_id=:'pid';
select test.assert((select row_version > :before_direct from public.products where id=:'pid'),'preço revenda direto avança versão');
select row_version as before_direct from public.products where id=:'pid' \gset
update public.products set name='Atualizado' where id=:'pid';
select test.assert((select row_version=:before_direct+1 from public.products where id=:'pid'),'produto direto avança versão');
select row_version as before_direct from public.products where id=:'pid' \gset
insert into public.product_specs(product_id,label,value) values(:'pid','Extra','V');
select test.assert((select row_version > :before_direct from public.products where id=:'pid'),'inserção filha avança versão');
select row_version as before_direct from public.products where id=:'pid' \gset
delete from public.product_specs where product_id=:'pid' and label='Extra';
select test.assert((select row_version > :before_direct from public.products where id=:'pid'),'exclusão filha avança versão');
-- Os limites são inclusivos; exatamente 20/100 passa.
select public.save_product(null,null,jsonb_set(jsonb_set(test.payload('BOUNDARY'),'{images}',(select jsonb_agg(jsonb_build_object('url','https://example.test/a','position',i)) from generate_series(0,19) i)), '{specs}',(select jsonb_agg(jsonb_build_object('label','L'||i,'value','V')) from generate_series(1,100) i)));
select test.assert((select count(*)=20 from public.product_images i join public.products p on p.id=i.product_id where p.sku='BOUNDARY') and (select count(*)=100 from public.product_specs s join public.products p on p.id=s.product_id where p.sku='BOUNDARY'),'limites inclusivos 20 imagens e 100 specs');
-- Ambos os preços podem ser iguais (revenda não SUPERIOR ao cliente).
select public.save_product(null,null,jsonb_set(test.payload('EQUAL'),'{pricing,resellerPrice}','100'));
select test.assert((select reseller_price=100 from public.product_reseller_prices r join public.products p on p.id=r.product_id where p.sku='EQUAL'),'revenda igual ao cliente permitida');
-- O estado intermediário publicado/incompleto não deve invalidar rascunho FINAL.
begin;
insert into public.products(name,sku,status) values('Transição','INTERMEDIATE','published');
update public.products set status='draft' where sku='INTERMEDIATE';
commit;
select test.assert((select status='draft' from public.products where sku='INTERMEDIATE'),'publicação adiada consulta estado final');
-- Rascunho permite listas vazias e preços null.
select public.save_product(null,null,test.payload('DRAFT') || '{"status":"draft","images":[],"specs":[],"pricing":{"currency":"BRL","customerPrice":null,"resellerPrice":null}}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select test.reject(test.payload('COMMON'),'42501','usuário comum sem acesso RPC');
select test.assert((select count(*)=0 from public.product_reseller_prices),'usuário comum não lê revenda');
with changed as (update public.products set name='Ataque' returning id) select test.assert((select count(*)=0 from changed),'usuário comum não altera produto');
with changed as (update public.product_reseller_prices set reseller_price=0 returning product_id) select test.assert((select count(*)=0 from changed),'usuário comum não altera revenda');
reset role;
select test.assert(not has_function_privilege('anon','public.save_product(uuid,integer,jsonb)','execute'), 'anon sem EXECUTE');
select test.assert(not has_function_privilege('service_role','public.save_product(uuid,integer,jsonb)','execute'), 'service_role sem EXECUTE RPC');
select test.assert((select not prosecdef from pg_proc where oid='public.save_product(uuid,integer,jsonb)'::regprocedure),'RPC SECURITY INVOKER');
