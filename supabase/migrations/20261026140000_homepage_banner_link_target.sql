-- Permite escolher se o banner abre o destino na mesma aba ou em nova aba.
alter table public.homepage_hero_slides
  add column if not exists open_in_new_tab boolean not null default false;
