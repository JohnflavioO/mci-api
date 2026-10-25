-- MCI Xpress: trilha de auditoria para suspensão e reativação de contas.
-- Não executa automaticamente: revisar e aplicar manualmente no Supabase após validar o PR.

begin;

create table if not exists public.admin_user_access_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('suspend', 'reactivate')),
  reason text not null check (length(btrim(reason)) between 5 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists admin_user_access_audit_target_created_idx
  on public.admin_user_access_audit (target_user_id, created_at desc);
create index if not exists admin_user_access_audit_actor_created_idx
  on public.admin_user_access_audit (actor_user_id, created_at desc);

alter table public.admin_user_access_audit enable row level security;
revoke all on public.admin_user_access_audit from public, anon, authenticated;
grant all on public.admin_user_access_audit to service_role;

commit;
