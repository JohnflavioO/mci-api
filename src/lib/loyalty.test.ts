import { describe, expect, it } from "vitest";
import { discountForPoints, loyaltyError, parseLoyaltySettings, pointsForAmount } from "./loyalty";

describe("cálculos de exibição (iguais ao banco)", () => {
  it("1 ponto por real, arredondado para baixo", () => {
    expect(pointsForAmount(4210, 1)).toBe(4210);
    expect(pointsForAmount(99.99, 1)).toBe(99);
    expect(pointsForAmount(null, 1)).toBe(0);
  });
  it("100 pontos = R$ 1,00", () => {
    expect(discountForPoints(4210, 1)).toBe(42.1);
    expect(discountForPoints(150, 1)).toBe(1.5);
    expect(discountForPoints(100, 2)).toBe(2);
  });
});

describe("parseLoyaltySettings", () => {
  const base = { enabled: true, points_per_real: 1, real_per_100_points: 1, max_redeem_pct: 20, min_redeem_points: 100, grace_days: 7, expiry_months: 12 };
  it("aceita as regras padrão e vírgula decimal", () => {
    expect(parseLoyaltySettings({ ...base, real_per_100_points: "1,5" })).toEqual({ ok: true, settings: { ...base, real_per_100_points: 1.5 } });
  });
  it("recusa limite acima de 50%, validade fora do intervalo e mínimo fracionado", () => {
    expect(parseLoyaltySettings({ ...base, max_redeem_pct: 60 }).ok).toBe(false);
    expect(parseLoyaltySettings({ ...base, expiry_months: 0 }).ok).toBe(false);
    expect(parseLoyaltySettings({ ...base, min_redeem_points: 10.5 }).ok).toBe(false);
    expect(parseLoyaltySettings({ ...base, enabled: "sim" }).ok).toBe(false);
  });
  it("traduz erros do banco", () => {
    expect(loyaltyError("LOY_NOT_ELIGIBLE")?.status).toBe(403);
    expect(loyaltyError("x")).toBeNull();
  });
});
