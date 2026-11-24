export type QuantityDiscountTier = {
  quantity: number;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  badge_label?: string | null;
  display_note?: string | null;
};

export type VolumeDiscountRule = {
  id: string;
  min_quantity: number;
  max_quantity: number | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  is_active: boolean;
  product_ids: string[];
  badge_label?: string | null;
  display_note?: string | null;
  is_featured?: boolean;
  sort_order?: number;
  quantity_discounts?: QuantityDiscountTier[] | null;
};

export type AppliedUnitDiscount = {
  quantity: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  unitDiscount: number;
};

export type VolumeDiscountQuote = {
  rule: VolumeDiscountRule | null;
  unitDiscount: number;
  discountedUnitPrice: number;
  totalDiscount: number;
  totalAfterDiscount: number;
  appliedTiers: AppliedUnitDiscount[];
};

function getUnitDiscount(unitPrice: number, type: "percentage" | "fixed", value: number) {
  const raw = type === "percentage"
    ? unitPrice * Math.min(100, Math.max(0, value)) / 100
    : Math.max(0, value);
  return Math.round(Math.min(unitPrice, raw) * 100) / 100;
}

export function getVolumeDiscountRule(
  quantity: number,
  rules: VolumeDiscountRule[],
  productId?: string,
): VolumeDiscountRule | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;

  return rules
    .filter((rule) => {
      if (!rule.is_active) return false;
      if (productId && !(rule.product_ids ?? []).includes(productId)) return false;
      const unitTiers = rule.quantity_discounts ?? [];
      if (unitTiers.length > 0) {
        // Per-unit mode is one rule containing the individual ordinal tiers.
        return quantity >= Math.min(...unitTiers.map((tier) => tier.quantity));
      }
      if (quantity < rule.min_quantity) return false;
      if (rule.max_quantity != null && quantity > rule.max_quantity) return false;
      return true;
    })
    .sort((a, b) => b.min_quantity - a.min_quantity)[0] ?? null;
}

/**
 * Cotação do revendedor igual à da página do produto e do carrinho (useCartPricing):
 * regra em percentual incide sobre o preço de cliente final e substitui o desconto base de revenda;
 * regra em valor fixo incide sobre o preço de revenda.
 * Teto: com faixa, nenhuma unidade sai mais cara que o preço de revenda do produto
 * (uma faixa abaixo do desconto de revenda não pode encarecer a compra maior).
 */
export function quoteResellerVolume(
  product: { slug: string; resellerPrice: number | null; customerPrice: number | null },
  quantity: number,
  rules: VolumeDiscountRule[],
): VolumeDiscountQuote | null {
  if (product.resellerPrice == null) return null;
  const rule = getVolumeDiscountRule(quantity, rules, product.slug);
  const base = rule?.discount_type === "percentage" && product.customerPrice != null
    ? Number(product.customerPrice)
    : Number(product.resellerPrice);
  return calculateVolumeDiscount(base, quantity, rules, product.slug, Number(product.resellerPrice));
}

export type VolumeTier = { key: string; quantity: number; maxQuantity: number | null; perUnit: boolean; discountType: "percentage" | "fixed"; discountValue: number; label: string };

/** Faixas ativas de um produto, em ordem de quantidade, prontas para exibir. */
export function volumeTiersFor(rules: VolumeDiscountRule[], productSlug: string): VolumeTier[] {
  const tiers: VolumeTier[] = [];
  for (const rule of rules) {
    if (!rule.is_active || !(rule.product_ids ?? []).includes(productSlug)) continue;
    const unitTiers = rule.quantity_discounts ?? [];
    if (unitTiers.length) {
      for (const tier of unitTiers) {
        tiers.push({ key: `${rule.id}-${tier.quantity}`, quantity: tier.quantity, maxQuantity: tier.quantity, perUnit: true, discountType: tier.discount_type, discountValue: Number(tier.discount_value), label: `${tier.quantity}ª unidade` });
      }
    } else {
      const label = rule.max_quantity == null ? `${rule.min_quantity}+ un.` : rule.min_quantity === rule.max_quantity ? `${rule.min_quantity} un.` : `${rule.min_quantity}–${rule.max_quantity} un.`;
      tiers.push({ key: rule.id, quantity: rule.min_quantity, maxQuantity: rule.max_quantity, perUnit: false, discountType: rule.discount_type, discountValue: Number(rule.discount_value), label });
    }
  }
  return tiers.sort((a, b) => a.quantity - b.quantity);
}

export type VolumeCondition = {
  key: string;
  ruleId: string;
  kind: "per_unit" | "range";
  /** Primeira quantidade em que a condição vale (para "faltam X unidades" e para o clique). */
  from: number;
  to: number | null;
  /** Ex.: "2 a 4 unidades", "5–9 unidades", "10+ unidades". */
  title: string;
  /** Ex.: "−R$ 80,00 por unidade", "29% OFF". */
  value: string;
  /** Ex.: "Na 2ª, 3ª e 4ª unidade" ou "2ª: −R$ 80,00 · 3ª: 10%". */
  detail: string | null;
};

const ordinalList = (positions: number[]) => {
  const items = positions.map((n) => `${n}ª`);
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}` : items[0] ?? "";
};

/**
 * Condições do desconto progressivo de um produto, prontas para exibir ao revendedor.
 * A regra por unidade (2ª, 3ª, 4ª...) vira UMA condição "2 a 4 unidades", em vez de uma opção por unidade.
 */
export function volumeConditionsFor(rules: VolumeDiscountRule[], productSlug: string, money: (value: number) => string): VolumeCondition[] {
  const amount = (type: "percentage" | "fixed", value: number) => (type === "percentage" ? `${value}%` : `−${money(value)}`);
  const conditions: VolumeCondition[] = [];
  for (const rule of rules) {
    if (!rule.is_active || !(rule.product_ids ?? []).includes(productSlug)) continue;
    const tiers = (rule.quantity_discounts ?? []).slice().sort((a, b) => a.quantity - b.quantity);
    if (tiers.length) {
      const from = tiers[0]!.quantity, to = tiers[tiers.length - 1]!.quantity;
      const same = tiers.every((t) => t.discount_type === tiers[0]!.discount_type && Number(t.discount_value) === Number(tiers[0]!.discount_value));
      conditions.push({
        key: rule.id, ruleId: rule.id, kind: "per_unit", from, to,
        title: from === to ? `${from}ª unidade` : `${from} a ${to} unidades`,
        value: same
          ? tiers[0]!.discount_type === "percentage" ? `${Number(tiers[0]!.discount_value)}% OFF por unidade` : `−${money(Number(tiers[0]!.discount_value))} por unidade`
          : "Desconto por unidade",
        detail: same
          ? `Na ${ordinalList(tiers.map((t) => t.quantity))} unidade`
          : tiers.map((t) => `${t.quantity}ª: ${amount(t.discount_type, Number(t.discount_value))}`).join(" · "),
      });
    } else {
      conditions.push({
        key: rule.id, ruleId: rule.id, kind: "range", from: rule.min_quantity, to: rule.max_quantity,
        title: rule.max_quantity == null ? `${rule.min_quantity}+ unidades` : rule.min_quantity === rule.max_quantity ? `${rule.min_quantity} unidades` : `${rule.min_quantity}–${rule.max_quantity} unidades`,
        value: rule.discount_type === "percentage" ? `${Number(rule.discount_value)}% OFF` : `−${money(Number(rule.discount_value))} por unidade`,
        detail: rule.display_note ?? null,
      });
    }
  }
  return conditions.sort((a, b) => a.from - b.from);
}

/** Legacy range rules discount every unit equally. Per-position rules discount only the specified unit number. */
export function calculateVolumeDiscount(
  unitPrice: number,
  quantity: number,
  rules: VolumeDiscountRule[],
  productId?: string,
  /** Preço máximo por unidade quando há faixa ativa (preço de revenda). Omitido = sem teto. */
  ceilingUnitPrice?: number,
): VolumeDiscountQuote {
  const safePrice = Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0;
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  const rule = getVolumeDiscountRule(safeQuantity, rules, productId);
  const unitTiers = (rule?.quantity_discounts ?? []).slice().sort((a, b) => a.quantity - b.quantity);
  const appliedTiers: AppliedUnitDiscount[] = [];
  let totalDiscount = 0;

  if (rule && unitTiers.length > 0) {
    for (const tier of unitTiers) {
      if (tier.quantity > safeQuantity) continue;
      const unitDiscount = getUnitDiscount(safePrice, tier.discount_type, Number(tier.discount_value));
      totalDiscount += unitDiscount;
      appliedTiers.push({
        quantity: tier.quantity,
        discountType: tier.discount_type,
        discountValue: Number(tier.discount_value),
        unitDiscount,
      });
    }
  } else if (rule) {
    const unitDiscount = getUnitDiscount(safePrice, rule.discount_type, Number(rule.discount_value));
    totalDiscount = unitDiscount * safeQuantity;
    appliedTiers.push({
      quantity: safeQuantity,
      discountType: rule.discount_type,
      discountValue: Number(rule.discount_value),
      unitDiscount,
    });
  }

  // Teto por unidade: a faixa nunca deixa uma unidade mais cara que o preço de revenda.
  const cap = rule && ceilingUnitPrice != null && Number.isFinite(ceilingUnitPrice) && ceilingUnitPrice < safePrice
    ? Math.max(0, ceilingUnitPrice)
    : null;
  if (cap != null) {
    if (unitTiers.length > 0) {
      const discountAt = new Map(appliedTiers.map((tier) => [tier.quantity, tier.unitDiscount]));
      for (let position = 1; position <= safeQuantity; position += 1) {
        totalDiscount += Math.max(0, safePrice - (discountAt.get(position) ?? 0) - cap);
      }
    } else {
      const unitDiscount = appliedTiers[0]?.unitDiscount ?? 0;
      totalDiscount += Math.max(0, safePrice - unitDiscount - cap) * safeQuantity;
    }
  }

  totalDiscount = Math.round(totalDiscount * 100) / 100;
  const totalAfterDiscount = Math.round(Math.max(0, safePrice * safeQuantity - totalDiscount) * 100) / 100;
  const discountedUnitPrice = safeQuantity > 0
    ? Math.round((totalAfterDiscount / safeQuantity) * 100) / 100
    : safePrice;
  const averageUnitDiscount = safeQuantity > 0
    ? Math.round((totalDiscount / safeQuantity) * 100) / 100
    : 0;
  return { rule, unitDiscount: averageUnitDiscount, discountedUnitPrice, totalDiscount, totalAfterDiscount, appliedTiers };
}
