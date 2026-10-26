-- MCI Xpress: permite reservar um slide do painel como mini banner da seção de categorias.
-- Mantém o fluxo de upload e edição existente; não altera banners ou arquivos atuais.
alter table public.homepage_hero_slides
  add column if not exists is_mini_banner boolean not null default false;
