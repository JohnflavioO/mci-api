-- Reverte apenas a 0003. ATENÇÃO: apaga os pedidos de cadastro; papéis já concedidos em user_roles permanecem.
begin;
drop trigger if exists on_auth_user_reseller on auth.users;
drop function if exists public.resubmit_reseller_application(text, text);
drop function if exists public.review_reseller_application(uuid, text, text, boolean);
drop function if exists public.handle_reseller_signup();
drop table if exists public.reseller_applications;
drop function if exists public.is_valid_cnpj(text);
drop type if exists public.reseller_status;
commit;
