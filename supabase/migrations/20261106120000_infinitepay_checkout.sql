-- InfinitePay Checkout Integrado: persistência do link e reconciliação da transação.
begin;
alter table public.orders
  add column if not exists provider_checkout_url text,
  add column if not exists provider_invoice_slug text,
  add column if not exists provider_transaction_nsu text,
  add column if not exists provider_capture_method text,
  add column if not exists provider_receipt_url text,
  add column if not exists payment_link_created_at timestamptz;

create unique index if not exists orders_infinitepay_transaction_nsu_uq
  on public.orders(provider_transaction_nsu)
  where provider_transaction_nsu is not null;

comment on column public.orders.provider_checkout_url is 'URL hospedada do checkout InfinitePay; nunca contém API Key.';
comment on column public.orders.provider_invoice_slug is 'Identificador da fatura InfinitePay usado em payment_check.';
comment on column public.orders.provider_transaction_nsu is 'Identificador único da transação InfinitePay confirmado no servidor.';
comment on column public.orders.provider_capture_method is 'Método confirmado pelo payment_check: pix ou credit_card.';
comment on column public.orders.provider_receipt_url is 'URL do comprovante retornada pela InfinitePay.';
commit;
