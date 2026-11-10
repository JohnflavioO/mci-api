-- Storefront conversion notifications for MCI Xpress.
-- Public messages are schedule-gated by RLS; admin writes require has_role('admin').
-- Real social proof returns only product and coarse shipping location, never buyer identity.
begin;

create table if not exists public.storefront_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('promotion','announcement','product','demo_purchase')),
  title text not null check (length(btrim(title)) between 2 and 100),
  message text not null check (length(btrim(message)) between 2 and 240),
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  image_url text check (image_url is null or (image_url ~ '^https://' and length(image_url) <= 2048)),
  cta_label text check (cta_label is null or length(cta_label) <= 40),
  cta_url text check (cta_url is null or (cta_url like '/%' or cta_url ~ '^https://' )),
  audience text not null default 'all' check (audience in ('all','visitors','customers','resellers')),
  interval_seconds integer not null default 30 check (interval_seconds between 15 and 180),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false,
  sort_order integer not null default 0,
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index if not exists storefront_notifications_active_schedule_idx
  on public.storefront_notifications (is_active, starts_at, ends_at, sort_order);

alter table public.storefront_notifications enable row level security;

drop policy if exists "storefront notifications public active read" on public.storefront_notifications;
create policy "storefront notifications public active read"
  on public.storefront_notifications for select to anon, authenticated
  using (is_active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()));

drop policy if exists "storefront notifications admin manage" on public.storefront_notifications;
create policy "storefront notifications admin manage"
  on public.storefront_notifications for all to authenticated
  using (public.has_role('admin'::public.app_role))
  with check (public.has_role('admin'::public.app_role));

grant select on public.storefront_notifications to anon, authenticated;
grant insert, update, delete on public.storefront_notifications to authenticated;

create table if not exists public.storefront_notification_events (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.storefront_notifications(id) on delete cascade,
  event_type text not null check (event_type in ('impression','click')),
  created_at timestamptz not null default now()
);
create index if not exists storefront_notification_events_notification_idx
  on public.storefront_notification_events (notification_id, created_at desc);
alter table public.storefront_notification_events enable row level security;
drop policy if exists "storefront notification events admin read" on public.storefront_notification_events;
create policy "storefront notification events admin read"
  on public.storefront_notification_events for select to authenticated
  using (public.has_role('admin'::public.app_role));
grant select on public.storefront_notification_events to authenticated;

create or replace function public.track_storefront_notification_event(p_notification_id uuid, p_event_type text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_event_type not in ('impression','click') then return false; end if;
  update public.storefront_notifications
  set impressions = impressions + case when p_event_type = 'impression' then 1 else 0 end,
      clicks = clicks + case when p_event_type = 'click' then 1 else 0 end,
      updated_at = now()
  where id = p_notification_id and is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now());
  return found;
end;
$$;
revoke all on function public.track_storefront_notification_event(uuid,text) from public;
grant execute on function public.track_storefront_notification_event(uuid,text) to anon, authenticated;

create or replace function public.get_storefront_recent_sales()
returns table(product_name text, city text, state text, purchased_at timestamptz)
language sql stable security definer set search_path = pg_catalog, public as $$
  select oi.name_snapshot, nullif(btrim(o.shipping_city), ''),
         nullif(upper(btrim(o.shipping_state::text)), ''), o.created_at
  from public.orders o join public.order_items oi on oi.order_id = o.id
  where o.status = 'paid' and o.created_at >= now() - interval '48 hours'
    and length(btrim(oi.name_snapshot)) > 0
  order by o.created_at desc limit 5;
$$;
revoke all on function public.get_storefront_recent_sales() from public;
grant execute on function public.get_storefront_recent_sales() to anon, authenticated;

comment on table public.storefront_notifications is
  'Campanhas de notificações de conversão exibidas na loja. Mensagens demo_purchase devem ser identificadas como demonstração.';
comment on function public.get_storefront_recent_sales() is
  'Retorna apenas nome do produto e localização aproximada de pedidos pagos recentes; nunca retorna dados pessoais do comprador.';

create table if not exists public.storefront_notification_settings (
  id boolean primary key default true check (id = true),
  real_sales_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.storefront_notification_settings (id, real_sales_enabled)
values (true, false) on conflict (id) do nothing;
alter table public.storefront_notification_settings enable row level security;
drop policy if exists "storefront notification settings public read" on public.storefront_notification_settings;
create policy "storefront notification settings public read"
  on public.storefront_notification_settings for select to anon, authenticated using (true);
drop policy if exists "storefront notification settings admin manage" on public.storefront_notification_settings;
create policy "storefront notification settings admin manage"
  on public.storefront_notification_settings for all to authenticated
  using (public.has_role('admin'::public.app_role))
  with check (public.has_role('admin'::public.app_role));
grant select on public.storefront_notification_settings to anon, authenticated;
grant insert, update on public.storefront_notification_settings to authenticated;

commit;