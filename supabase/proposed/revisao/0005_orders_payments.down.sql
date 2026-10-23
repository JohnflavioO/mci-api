-- Reverte só a 0005. Atenção: apaga pedidos, eventos de pagamento e a fila de estornos pendentes.
-- Não devolve estoque já debitado. Não rodar com pedidos 'refund_required' sem estornar antes.
begin;
grant execute on function public.confirm_sale_stock(jsonb) to authenticated;
drop function if exists public.record_refund_failure(uuid, text);
drop function if exists public.claim_refund(integer);
drop function if exists public.apply_payment_status(uuid, text, text, text, text, numeric);
drop function if exists public.create_order(uuid, uuid, jsonb);
drop table if exists public.payment_events;
drop table if exists public.order_items;
drop table if exists public.orders;
drop type if exists public.order_status;
commit;
