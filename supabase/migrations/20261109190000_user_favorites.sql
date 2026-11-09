create table if not exists public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.user_favorites enable row level security;
drop policy if exists "Users can read their own favorites" on public.user_favorites;
create policy "Users can read their own favorites" on public.user_favorites
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can add their own favorites" on public.user_favorites;
create policy "Users can add their own favorites" on public.user_favorites
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can remove their own favorites" on public.user_favorites;
create policy "Users can remove their own favorites" on public.user_favorites
  for delete to authenticated using (auth.uid() = user_id);
grant select, insert, delete on public.user_favorites to authenticated;
