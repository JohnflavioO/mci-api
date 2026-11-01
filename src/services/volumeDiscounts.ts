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

/** Legacy range rules discount every unit equally. Per-position rules discount only the specified unit number. */
export function calculateVolumeDiscount(
  unitPrice: number,
  quantity: number,
  rules: VolumeDiscountRule[],
  productId?: string,
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
