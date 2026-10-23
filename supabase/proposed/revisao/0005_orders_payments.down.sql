-- Reverte só a 0005. Atenção: apaga pedidos e eventos de pagamento. Não devolve estoque já debitado.
begin;
drop function if exists public.apply_payment_status(uuid, text, text, text, numeric);
drop function if exists public.create_order(uuid, uuid, jsonb);
drop table if exists public.payment_events;
drop table if exists public.order_items;
drop table if exists public.orders;
drop type if exists public.order_status;
commit;
