export type VolumeDiscountRule = {
  id: string;
  min_quantity: number;
  max_quantity: number | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  is_active: boolean;
  product_ids: string[];
};

export type VolumeDiscountQuote = {
  rule: VolumeDiscountRule | null;
  unitDiscount: number;
  discountedUnitPrice: number;
  totalDiscount: number;
  totalAfterDiscount: number;
};

export function getVolumeDiscountRule(
  quantity: number,
  rules: VolumeDiscountRule[],
  productId?: string,
): VolumeDiscountRule | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;

  return rules
    .filter((rule) => {
      if (!rule.is_active || quantity < rule.min_quantity) return false;
      if (rule.max_quantity != null && quantity > rule.max_quantity) return false;
      // Quando há identificação do produto, somente regras explicitamente direcionadas a ele valem.
      if (productId && !(rule.product_ids ?? []).includes(productId)) return false;
      return true;
    })
    .sort((a, b) => b.min_quantity - a.min_quantity)[0] ?? null;
}

/** O desconto fixo é aplicado por unidade. O desconto nunca pode exceder o preço unitário. */
export function calculateVolumeDiscount(
  unitPrice: number,
  quantity: number,
  rules: VolumeDiscountRule[],
  productId?: string,
): VolumeDiscountQuote {
  const safePrice = Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0;
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  const rule = getVolumeDiscountRule(safeQuantity, rules, productId);
  const rawDiscount = !rule ? 0 : rule.discount_type === "percentage"
    ? safePrice * Math.min(100, Math.max(0, rule.discount_value)) / 100
    : Math.max(0, rule.discount_value);
  const unitDiscount = Math.round(Math.min(safePrice, rawDiscount) * 100) / 100;
  const discountedUnitPrice = Math.round((safePrice - unitDiscount) * 100) / 100;
  const totalDiscount = Math.round(unitDiscount * safeQuantity * 100) / 100;
  const totalAfterDiscount = Math.round((discountedUnitPrice * safeQuantity) * 100) / 100;
  return { rule, unitDiscount, discountedUnitPrice, totalDiscount, totalAfterDiscount };
}
