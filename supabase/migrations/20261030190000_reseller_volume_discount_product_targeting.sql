-- Define explicit product targeting for each reseller volume discount tier.
alter table public.reseller_volume_discount_rules
  add column if not exists product_ids text[] not null default '{}';

comment on column public.reseller_volume_discount_rules.product_ids is
  'IDs dos produtos publicados aos quais esta faixa se aplica. Faixa sem produtos selecionados não concede desconto.';
