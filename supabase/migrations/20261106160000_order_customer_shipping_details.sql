-- Store House: persistência dos dados fiscais e de entrega no próprio pedido.
-- Aplicar antes de publicar a versão que grava estes campos em public.orders.
begin;

alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_document text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists shipping_cep text,
  add column if not exists shipping_street text,
  add column if not exists shipping_number text,
  add column if not exists shipping_complement text,
  add column if not exists shipping_district text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state char(2);

comment on column public.orders.customer_document is 'CPF/CNPJ informado no checkout; dado fiscal protegido pelas políticas de acesso ao pedido.';
comment on column public.orders.customer_name is 'Nome do comprador informado no checkout.';
comment on column public.orders.shipping_cep is 'CEP de entrega informado no checkout.';

commit;
