create table if not exists public.shipping_provider_credentials (
  provider text primary key,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint shipping_provider_credentials_provider_check check (provider in ('melhor_envio'))
);

alter table public.shipping_provider_credentials enable row level security;
revoke all on public.shipping_provider_credentials from anon, authenticated;
