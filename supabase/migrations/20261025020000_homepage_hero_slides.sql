create table if not exists public.homepage_hero_slides (
  id uuid primary key default gen_random_uuid(),
  eyebrow text not null default 'MCI Xpress',
  title text not null,
  description text,
  image_url text not null,
  mobile_image_url text,
  button_label text not null default 'Ver produtos',
  button_url text not null default '/catalogo',
  sort_order integer not null default 0,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homepage_hero_slides_image_https check (image_url ~ '^https://'),
  constraint homepage_hero_slides_mobile_https check (mobile_image_url is null or mobile_image_url ~ '^https://'),
  constraint homepage_hero_slides_button_url check (button_url like '/%' or button_url ~ '^https://')
);

alter table public.homepage_hero_slides enable row level security;

drop policy if exists "Public can read active homepage hero slides" on public.homepage_hero_slides;
create policy "Public can read active homepage hero slides"
on public.homepage_hero_slides for select to anon, authenticated
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);

drop policy if exists "Admins manage homepage hero slides" on public.homepage_hero_slides;
create policy "Admins manage homepage hero slides"
on public.homepage_hero_slides for all to authenticated
using (public.has_role('admin'::public.app_role))
with check (public.has_role('admin'::public.app_role));

create index if not exists homepage_hero_slides_public_order_idx
on public.homepage_hero_slides (is_active, sort_order);
