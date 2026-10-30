-- Desconto progressivo por volume para revendedores.
-- Esta migration é proposta no repositório; não foi aplicada ao Supabase.
create table if not exists public.reseller_volume_discount_rules (
  id uuid primary key default gen_random_uuid(),
  min_quantity integer not null check (min_quantity >= 2),
  max_quantity integer,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reseller_volume_discount_valid_range check (max_quantity is null or max_quantity >= min_quantity),
  constraint reseller_volume_discount_percentage check (discount_type <> 'percentage' or discount_value <= 100),
  constraint reseller_volume_discount_unique_min unique (min_quantity)
);

create index if not exists reseller_volume_discount_active_min_idx
  on public.reseller_volume_discount_rules (is_active, min_quantity desc);

alter table public.reseller_volume_discount_rules enable row level security;

drop policy if exists "Admins manage reseller volume discounts" on public.reseller_volume_discount_rules;
create policy "Admins manage reseller volume discounts"
  on public.reseller_volume_discount_rules for all to authenticated
  using (public.has_role('admin'::public.app_role))
  with check (public.has_role('admin'::public.app_role));

drop policy if exists "Resellers read active volume discounts" on public.reseller_volume_discount_rules;
create policy "Resellers read active volume discounts"
  on public.reseller_volume_discount_rules for select to authenticated
  using (is_active = true and public.has_role('revendedor'::public.app_role));

comment on table public.reseller_volume_discount_rules is
  'Faixas de desconto por quantidade de luminárias em um mesmo pedido de revendedor. Desconto fixo é por unidade.';
