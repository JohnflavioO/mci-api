-- Support per-position reseller discounts and their storefront presentation.
alter table public.reseller_volume_discount_rules
  add column if not exists quantity_discounts jsonb not null default '[]'::jsonb,
  add column if not exists badge_label text,
  add column if not exists display_note text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists sort_order integer not null default 0;

comment on column public.reseller_volume_discount_rules.quantity_discounts is
  'Optional per-position discount tiers. Each configured discount applies only to the unit at that position.';
comment on column public.reseller_volume_discount_rules.badge_label is
  'Optional visual label displayed with the discount option.';
comment on column public.reseller_volume_discount_rules.display_note is
  'Optional supporting text displayed with the discount option.';
