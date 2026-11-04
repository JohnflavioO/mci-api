-- Reconcile affiliate accounts created before the affiliate signup trigger was installed.
-- The registration metadata is the source of truth for accounts created through /cadastro?tipo=afiliado.
begin;

insert into public.user_roles (user_id, role)
select u.id, 'afiliado'::public.app_role
from auth.users u
where u.raw_user_meta_data->>'registration_type' = 'afiliado'
on conflict do nothing;

insert into public.affiliate_profiles (user_id, referral_code, display_name)
select
  u.id,
  lower(substr(replace(u.id::text, '-', ''), 1, 10)),
  nullif(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), '')
from auth.users u
where u.raw_user_meta_data->>'registration_type' = 'afiliado'
on conflict (user_id) do update
set display_name = coalesce(public.affiliate_profiles.display_name, excluded.display_name),
    updated_at = now();

commit;
