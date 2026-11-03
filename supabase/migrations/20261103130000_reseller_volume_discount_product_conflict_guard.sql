-- Allow identical quantity thresholds for different products while preventing
-- overlapping active discount rules for the same product.
begin;

alter table public.reseller_volume_discount_rules
  drop constraint if exists reseller_volume_discount_unique_min;

create index if not exists reseller_volume_discount_product_ids_gin_idx
  on public.reseller_volume_discount_rules using gin (product_ids);

create or replace function public.prevent_overlapping_reseller_volume_discount_rules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Empty product selection does not target any product and grants no discount.
  if not new.is_active
     or coalesce(cardinality(new.product_ids), 0) = 0 then
    return new;
  end if;

  -- Serialize rule writes so two concurrent admin saves cannot bypass the check.
  perform pg_advisory_xact_lock(
    hashtextextended('public.reseller_volume_discount_rules', 0)
  );

  if exists (
    select 1
    from public.reseller_volume_discount_rules existing
    where existing.id is distinct from new.id
      and existing.is_active
      and coalesce(cardinality(existing.product_ids), 0) > 0
      and existing.product_ids && new.product_ids
      and int4range(existing.min_quantity, existing.max_quantity, '[]')
          && int4range(new.min_quantity, new.max_quantity, '[]')
  ) then
    raise exception using
      errcode = '23P01',
      message = 'Já existe uma regra ativa com intervalo de quantidade sobreposto para pelo menos um dos produtos selecionados.',
      detail = 'Edite a regra existente, pause-a ou ajuste os produtos/intervalo de quantidade antes de salvar.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_overlapping_reseller_volume_discount_rules
  on public.reseller_volume_discount_rules;

create trigger trg_prevent_overlapping_reseller_volume_discount_rules
before insert or update of min_quantity, max_quantity, product_ids, is_active
on public.reseller_volume_discount_rules
for each row
execute function public.prevent_overlapping_reseller_volume_discount_rules();

comment on function public.prevent_overlapping_reseller_volume_discount_rules() is
  'Impede sobreposição de faixas ativas para o mesmo produto e permite a mesma quantidade mínima em produtos diferentes.';

commit;
