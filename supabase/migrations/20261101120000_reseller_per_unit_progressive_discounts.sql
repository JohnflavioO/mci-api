-- Support a different discount for each unit position in a reseller purchase.
alter table public.reseller_volume_discount_rules
  add column if not exists quantity_discounts jsonb not null default '[]'::jsonb;

comment on column public.reseller_volume_discount_rules.quantity_discounts is
  'Optional per-position discount tiers, e.g. [{"quantity":2,"discount_type":"percentage","discount_value":5},{"quantity":3,"discount_type":"percentage","discount_value":10}]. The discount applies only to the unit at that position.';
