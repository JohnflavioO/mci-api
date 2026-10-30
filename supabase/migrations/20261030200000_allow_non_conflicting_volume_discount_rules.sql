-- Permite faixas com a mesma quantidade mínima quando não há conflito real.
-- A validação da interface considera sobreposição de intervalo E interseção de produtos.
alter table public.reseller_volume_discount_rules
  drop constraint if exists reseller_volume_discount_unique_min;

-- Compatibilidade com bancos onde o nome foi gerado automaticamente pelo PostgreSQL.
alter table public.reseller_volume_discount_rules
  drop constraint if exists reseller_volume_discount_rules_min_quantity_key;

comment on table public.reseller_volume_discount_rules is
  'Faixas de desconto por volume; regras podem compartilhar quantidades desde que não se sobreponham para o mesmo produto.';
