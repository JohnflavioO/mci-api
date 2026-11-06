alter table public.orders
  add column if not exists shipping_amount numeric(12,2) not null default 0 check (shipping_amount >= 0),
  add column if not exists shipping_provider text,
  add column if not exists shipping_service text,
  add column if not exists shipping_quote_token text;
