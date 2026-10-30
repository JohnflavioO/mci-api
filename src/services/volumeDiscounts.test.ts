import { describe, expect, it } from "vitest";
import { calculateVolumeDiscount, getVolumeDiscountRule, type VolumeDiscountRule } from "./volumeDiscounts";

const rules: VolumeDiscountRule[] = [
  { id: "a", min_quantity: 2, max_quantity: 3, discount_type: "percentage", discount_value: 3, is_active: true },
  { id: "b", min_quantity: 4, max_quantity: 5, discount_type: "fixed", discount_value: 100, is_active: true },
  { id: "c", min_quantity: 6, max_quantity: null, discount_type: "percentage", discount_value: 8, is_active: true },
];

describe("progressive reseller discounts", () => {
  it("selects the matching quantity tier", () => {
    expect(getVolumeDiscountRule(1, rules)).toBeNull();
    expect(getVolumeDiscountRule(3, rules)?.id).toBe("a");
    expect(getVolumeDiscountRule(4, rules)?.id).toBe("b");
    expect(getVolumeDiscountRule(10, rules)?.id).toBe("c");
  });
  it("applies fixed discount per unit and calculates order savings", () => {
    const quote = calculateVolumeDiscount(1000, 4, rules);
    expect(quote.unitDiscount).toBe(100);
    expect(quote.discountedUnitPrice).toBe(900);
    expect(quote.totalDiscount).toBe(400);
    expect(quote.totalAfterDiscount).toBe(3600);
  });
  it("never discounts below zero and caps percentage at price", () => {
    const quote = calculateVolumeDiscount(50, 4, [{ ...rules[1], discount_value: 90 }]);
    expect(quote.unitDiscount).toBe(50);
    expect(quote.discountedUnitPrice).toBe(0);
  });
  it("applies only rules assigned to the selected product", () => {
    const targeted: VolumeDiscountRule[] = [
      { ...rules[0], product_ids: ["lamp-a"] },
      { ...rules[1], product_ids: ["lamp-b"] },
    ];
    expect(getVolumeDiscountRule(3, targeted, "lamp-a")?.id).toBe("a");
    expect(getVolumeDiscountRule(4, targeted, "lamp-a")).toBeNull();
    expect(getVolumeDiscountRule(4, targeted, "lamp-b")?.id).toBe("b");
    expect(calculateVolumeDiscount(1000, 4, targeted, "lamp-a").totalDiscount).toBe(0);
  });

  it("ignores inactive tiers", () => {
    expect(getVolumeDiscountRule(4, [{ ...rules[1], is_active: false }])).toBeNull();
  });
});
