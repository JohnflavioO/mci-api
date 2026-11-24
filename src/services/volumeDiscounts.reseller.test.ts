import { describe, expect, it } from "vitest";
import { quoteResellerVolume, volumeConditionsFor, volumeTiersFor, type VolumeDiscountRule } from "./volumeDiscounts";

const RAY = { slug: "ray-360c", resellerPrice: 3073.3, customerPrice: 4210 };
const rule = (over: Partial<VolumeDiscountRule>): VolumeDiscountRule => ({
  id: "r", min_quantity: 5, max_quantity: 9, discount_type: "percentage", discount_value: 29, is_active: true, product_ids: [RAY.slug], ...over,
});
const RULES = [rule({ id: "a" }), rule({ id: "b", min_quantity: 10, max_quantity: null, discount_value: 31 })];

describe("quoteResellerVolume (mesmo cálculo da página do produto)", () => {
  it("abaixo da faixa vale o preço de revenda", () => {
    const q = quoteResellerVolume(RAY, 2, RULES)!;
    expect(q.rule).toBeNull();
    expect(q.discountedUnitPrice).toBe(3073.3);
    expect(q.totalAfterDiscount).toBe(6146.6);
  });
  it("faixa em % incide sobre o preço de cliente final", () => {
    const q = quoteResellerVolume(RAY, 5, RULES)!;
    expect(q.discountedUnitPrice).toBe(2989.1); // 4210 − 29%
    expect(q.totalAfterDiscount).toBe(14945.5);
    expect(quoteResellerVolume(RAY, 10, RULES)!.discountedUnitPrice).toBe(2904.9); // 4210 − 31%
  });
  it("faixa abaixo do desconto de revenda não encarece: teto no preço de revenda", () => {
    const RAY660 = { slug: "ray-660c", resellerPrice: 3999.2, customerPrice: 4999 }; // revenda já tem 20%
    const low = [rule({ id: "low", product_ids: [RAY660.slug], min_quantity: 5, max_quantity: null, discount_value: 15 })];
    const q = quoteResellerVolume(RAY660, 5, low)!;
    expect(q.discountedUnitPrice).toBe(3999.2); // 4999 − 15% = 4249,15 > 3999,20
    expect(q.totalAfterDiscount).toBe(19996);
  });
  it("faixa por unidade: unidades sem faixa pagam no máximo o preço de revenda", () => {
    const P = { slug: "p", resellerPrice: 800, customerPrice: 1000 };
    const perUnit = [rule({ id: "u", product_ids: ["p"], min_quantity: 2, max_quantity: null, discount_value: 0, quantity_discounts: [{ quantity: 2, discount_type: "percentage", discount_value: 10 }] })];
    expect(quoteResellerVolume(P, 2, perUnit)!.totalAfterDiscount).toBe(1600); // min(1000, 800) + min(900, 800)
    const deep = [rule({ id: "d", product_ids: ["p"], min_quantity: 2, max_quantity: null, discount_value: 0, quantity_discounts: [{ quantity: 2, discount_type: "percentage", discount_value: 30 }] })];
    expect(quoteResellerVolume(P, 2, deep)!.totalAfterDiscount).toBe(1500); // 800 + 700
  });
  it("regra por unidade (2ª a 4ª) convive com as faixas 5–9 e 10+", () => {
    const perUnit = rule({ id: "pu", min_quantity: 2, max_quantity: 4, discount_type: "fixed", discount_value: 80, quantity_discounts: [2, 3, 4].map((quantity) => ({ quantity, discount_type: "fixed" as const, discount_value: 80 })) });
    const all = [perUnit, ...RULES];
    expect(quoteResellerVolume(RAY, 1, all)!.totalAfterDiscount).toBe(3073.3);
    expect(quoteResellerVolume(RAY, 4, all)!.totalAfterDiscount).toBe(12053.2); // 3.073,30 + 3 × 2.993,30
    expect(quoteResellerVolume(RAY, 5, all)!.totalAfterDiscount).toBe(14945.5); // faixa 5–9 vence
    expect(quoteResellerVolume(RAY, 10, all)!.discountedUnitPrice).toBe(2904.9); // faixa 10+
    // Produto só com a regra por unidade: acima da 4ª, as unidades 2–4 seguem com desconto.
    expect(quoteResellerVolume(RAY, 6, [perUnit])!.totalAfterDiscount).toBe(18199.8); // 6 × 3.073,30 − 3 × 80
  });
  it("sem preço de revenda não cota", () => {
    expect(quoteResellerVolume({ ...RAY, resellerPrice: null }, 5, RULES)).toBeNull();
  });
});

describe("volumeConditionsFor (indicativo na página do produto e no catálogo)", () => {
  const money = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  it("regra por unidade 2ª–4ª vira uma condição só, antes das faixas", () => {
    const perUnit = rule({ id: "pu", min_quantity: 2, max_quantity: 4, discount_type: "fixed", discount_value: 80, quantity_discounts: [4, 2, 3].map((quantity) => ({ quantity, discount_type: "fixed" as const, discount_value: 80 })) });
    const c = volumeConditionsFor([...RULES, perUnit], RAY.slug, money);
    expect(c.map((x) => [x.title, x.value])).toEqual([
      ["2 a 4 unidades", "−R$ 80,00 por unidade"],
      ["5–9 unidades", "29% OFF"],
      ["10+ unidades", "31% OFF"],
    ]);
    expect(c[0]!.detail).toBe("Na 2ª, 3ª e 4ª unidade");
    expect(c[0]!.from).toBe(2);
  });
  it("valores diferentes por unidade aparecem detalhados", () => {
    const mixed = rule({ id: "mx", quantity_discounts: [{ quantity: 2, discount_type: "fixed", discount_value: 50 }, { quantity: 3, discount_type: "percentage", discount_value: 10 }] });
    const [c] = volumeConditionsFor([mixed], RAY.slug, money);
    expect(c!.value).toBe("Desconto por unidade");
    expect(c!.detail).toBe("2ª: −R$ 50,00 · 3ª: 10%");
  });
});

describe("volumeTiersFor", () => {
  it("lista só as faixas ativas do produto, em ordem", () => {
    const tiers = volumeTiersFor([RULES[1]!, RULES[0]!, rule({ id: "x", is_active: false, min_quantity: 3 }), rule({ id: "y", product_ids: ["outro"] })], RAY.slug);
    expect(tiers.map((t) => t.label)).toEqual(["5–9 un.", "10+ un."]);
  });
  it("faixas por unidade viram uma entrada por posição", () => {
    const tiers = volumeTiersFor([rule({ id: "u", quantity_discounts: [{ quantity: 3, discount_type: "percentage", discount_value: 5 }, { quantity: 2, discount_type: "fixed", discount_value: 50 }] })], RAY.slug);
    expect(tiers.map((t) => [t.label, t.perUnit])).toEqual([["2ª unidade", true], ["3ª unidade", true]]);
  });
});
