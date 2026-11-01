-- Add merchandising controls to reseller volume discount tiers.
alter table public.reseller_volume_discount_rules
  add column if not exists badge_label text,
  add column if not exists display_note text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists sort_order integer not null default 0;

comment on column public.reseller_volume_discount_rules.badge_label is
  'Optional short visual badge displayed on the reseller volume tier, e.g. MELHOR PREÇO.';
comment on column public.reseller_volume_discount_rules.display_note is
  'Optional short explanatory text displayed with the reseller volume tier.';
comment on column public.reseller_volume_discount_rules.is_featured is
  'Whether the tier should receive visual emphasis in the storefront.';
comment on column public.reseller_volume_discount_rules.sort_order is
  'Display ordering for reseller volume tiers; lower values appear first.';
