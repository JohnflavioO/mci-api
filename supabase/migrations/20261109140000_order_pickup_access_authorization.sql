alter table public.orders
  add column if not exists pickup_contact_name text,
  add column if not exists pickup_contact_cpf text,
  add column if not exists pickup_vehicle_plate text;

alter table public.orders
  add constraint orders_pickup_authorization_complete
  check (
    shipping_provider is distinct from 'pickup'
    or (
      nullif(btrim(pickup_contact_name), '') is not null
      and pickup_contact_cpf ~ '^[0-9]{11}$'
      and pickup_vehicle_plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$|^[A-Z]{3}[0-9]{4}$'
    )
  ) not valid;

alter table public.orders validate constraint orders_pickup_authorization_complete;
