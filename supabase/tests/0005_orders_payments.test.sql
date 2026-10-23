\set ON_ERROR_STOP on
-- Requer 0001 v2 + 0002 + 0004 + 0005 e os helpers de 0002_save_product.test.sql (schema test).
create schema if not exists test;
create or replace function test.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
grant usage, create on schema test to authenticated, service_role; grant usage on schema test to anon;
grant execute on all functions in schema test to authenticated, anon, service_role;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000101'),('00000000-0000-0000-0000-000000000102') on conflict do nothing;
insert into public.user_roles(user_id,role) values ('00000000-0000-0000-0000-000000000101','admin') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',false);
create table test.ids as
select (public.save_product(null,null, jsonb_build_object('name','A','brand','','sku','P5A','category','C','description',null,'status','published',
  'pricing',jsonb_build_object('currency','BRL','customerPrice',10,'resellerPrice',5),
  'images',jsonb_build_array(jsonb_build_object('url','https://e.test/a.jpg','position',0)),'specs','[]'::jsonb))->>'id')::uuid as a,
       (public.save_product(null,null, jsonb_build_object('name','B','brand','','sku','P5B','category','C','description',null,'status','published',
  'pricing',jsonb_build_object('currency','BRL','customerPrice',20,'resellerPrice',5),
  'images',jsonb_build_array(jsonb_build_object('url','https://e.test/b.jpg','position',0)),'specs','[]'::jsonb))->>'id')::uuid as b;
select a, b from test.ids \gset
select public.set_product_stock(:'a', 5), public.set_product_stock(:'b', 5);
reset role;
grant select on test.ids to service_role;

create or replace function test.order_(key text, qa int, qb int) returns uuid language sql as $$
  select public.create_order('00000000-0000-0000-0000-000000000102', key::uuid,
    jsonb_build_array(jsonb_build_object('product_id',(select a from test.ids),'qty',qa), jsonb_build_object('product_id',(select b from test.ids),'qty',qb))) $$;
create or replace function test.stock(p uuid) returns int language sql as $$ select stock_quantity from public.products where id=p $$;

grant execute on all functions in schema test to service_role;
set role service_role;
-- Pix pendente
select test.order_('00000000-0000-0000-0000-00000000a001',1,1) as o1 \gset
select test.assert(public.apply_payment_status(:'o1','pagarme','ch_1','pending','ev1',30)='pending_payment','pix pendente mantém pedido aguardando');
select test.assert(test.stock(:'a')=5,'pix pendente não baixa estoque');
-- Idempotência de criação
select test.assert(test.order_('00000000-0000-0000-0000-00000000a001',1,1)=:'o1','mesma chave devolve o mesmo pedido');
-- Aprovado
select test.assert(public.apply_payment_status(:'o1','pagarme','ch_1','paid','ev2',30)='paid','pagamento aprovado');
select test.assert(test.stock(:'a')=4 and test.stock(:'b')=4,'aprovado baixa estoque uma vez');
-- Notificação repetida e fora de ordem
select test.assert(public.apply_payment_status(:'o1','pagarme','ch_1','paid','ev2',30)='paid','evento repetido ignorado');
select test.assert(public.apply_payment_status(:'o1','pagarme','ch_1','paid','ev2b',30)='paid','novo evento paid não debita de novo');
select test.assert(public.apply_payment_status(:'o1','pagarme','ch_1','pending','ev0',30)='paid','pending atrasado não regride');
select test.assert(test.stock(:'a')=4,'sem baixa duplicada');
-- Reembolso de pedido pago devolve estoque uma vez
select test.assert(public.apply_payment_status(:'o1','pagarme','ch_1','refunded','ev3',30)='refunded','reembolso confirmado');
select test.assert(public.apply_payment_status(:'o1','pagarme','ch_1','chargedback','ev4',30)='refunded','chargeback após reembolso não repõe de novo');
select test.assert(test.stock(:'a')=5 and test.stock(:'b')=5,'estoque reposto uma única vez');
select test.assert(public.apply_payment_status(:'o1','pagarme','ch_1','paid','ev5',30)='refunded','paid atrasado após reembolso ignorado');
-- Cartão recusado
select test.order_('00000000-0000-0000-0000-00000000a002',1,1) as o2 \gset
select test.assert(public.apply_payment_status(:'o2','pagarme','ch_2','failed','ev6',30)='rejected','cartão recusado');
select test.assert(test.stock(:'a')=5,'recusado não mexe no estoque');
-- Pago depois de recusado => reembolso necessário
select test.assert(public.apply_payment_status(:'o2','pagarme','ch_2','paid','ev7',30)='refund_required','pago após recusa exige reembolso');
select test.assert(test.stock(:'a')=5,'sem baixa ao exigir reembolso');
-- Valor divergente rejeitado e nada registrado
select test.order_('00000000-0000-0000-0000-00000000a003',1,1) as o3 \gset
do $$ begin perform public.apply_payment_status((select id from public.orders where idempotency_key='00000000-0000-0000-0000-00000000a003'),'pagarme','ch_3','paid','ev8',1);
  raise exception 'FAIL: valor divergente aceito'; exception when sqlstate '23514' then raise notice 'PASS: valor divergente rejeitado'; end $$;
select test.assert(not exists(select 1 from public.payment_events where provider_event_id='ev8'),'evento com valor divergente revertido');
-- Estoque insuficiente: A tem 5, pedido quer 1 de A; zera B antes da aprovação
reset role;
update public.products set stock_quantity = 0 where id = :'b';
set role service_role;
select test.assert(public.apply_payment_status(:'o3','pagarme','ch_3','paid','ev9',30)='refund_required','estoque insuficiente => reembolso necessário');
select test.assert(test.stock(:'a')=5 and test.stock(:'b')=0,'nenhum item baixado parcialmente');
select test.assert(exists(select 1 from public.payment_events where provider_event_id='ev9' and result='refund_required'),'evento registrado na mesma transação');
select test.assert((select refund_idempotency_key is not null and not stock_debited from public.orders where id=:'o3'),'chave de estorno fixa criada');
select test.assert(public.apply_payment_status(:'o3','pagarme','ch_3','paid','ev10',30)='refund_required','paid repetido mantém reembolso necessário');
-- Fila de estorno: claim, falha, nova tentativa com a mesma chave
create temp table c1 as select * from public.claim_refund(60);
select test.assert((select count(*)=1 from c1),'claim pega um pedido');
create temp table c2 as select * from public.claim_refund(60);
create temp table c3 as select * from public.claim_refund(60);
select test.assert((select count(*)=0 from c3),'pedidos em lease não são pegos de novo');
select order_id as c1o, refund_idempotency_key as k1 from c1 \gset
select public.record_refund_failure(:'c1o','timeout de rede');
select test.assert((select status='refund_required' and refund_last_error='timeout de rede' and refund_locked_until is null from public.orders where id=:'c1o'),'falha mantém pendente');
create temp table c4 as select * from public.claim_refund(60);
select test.assert((select order_id=:'c1o' and refund_idempotency_key=:'k1' and attempt=2 from c4),'retentativa reutiliza a mesma chave');
select test.assert((select status='refund_required' from public.orders where id=:'c1o'),'pedir estorno não marca reembolsado');
select test.assert(public.apply_payment_status(:'o3','pagarme','ch_3','refunded','ev11',30)='refunded','só confirmado pelo provedor vira reembolsado');
select test.assert(test.stock(:'a')=5 and test.stock(:'b')=0,'reembolso sem baixa não repõe estoque');
select public.record_refund_failure(:'o3','tarde');
select test.assert((select status='refunded' from public.orders where id=:'o3'),'falha tardia não reabre reembolso');
-- Cobrança de outro pedido rejeitada
do $$ begin perform public.apply_payment_status((select id from public.orders where idempotency_key='00000000-0000-0000-0000-00000000a002'),'pagarme','ch_x','refunded','ev12',30);
  raise exception 'FAIL'; exception when sqlstate '23514' then raise notice 'PASS: cobrança alheia rejeitada'; end $$;
reset role;
-- Permissões
select test.assert(not has_function_privilege('authenticated','public.apply_payment_status(uuid,text,text,text,text,numeric)','execute'),'usuário não aplica pagamento');
select test.assert(not has_function_privilege('authenticated','public.claim_refund(integer)','execute'),'usuário não reserva estorno');
select test.assert(not has_function_privilege('anon','public.create_order(uuid,uuid,jsonb)','execute'),'anônimo não cria pedido');
update public.products set stock_quantity = 1 where id in (:'a', :'b');
