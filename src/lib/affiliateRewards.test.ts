import { describe, expect, it } from "vitest";
import { parseRewardInput, rewardError } from "./affiliateRewards";

describe("parseRewardInput", () => {
  it("aceita recompensa nova com estoque ilimitado", () => {
    const r = parseRewardInput({ name: "  Camiseta  Store House ", points_cost: "500", stock_quantity: "" });
    expect(r).toEqual({ ok: true, reward: { id: null, name: "Camiseta Store House", description: null, points_cost: 500, stock_quantity: null, active: true, image_url: null } });
  });
  it("mantém id, estoque e situação ao editar", () => {
    const r = parseRewardInput({ id: "8d2f3a4b-1c2d-4e5f-9a0b-1c2d3e4f5a6b", name: "Boné", points_cost: 300, stock_quantity: 0, active: false, image_url: "https://cdn.exemplo.com/bone.jpg" });
    expect(r.ok && r.reward).toMatchObject({ stock_quantity: 0, active: false, image_url: "https://cdn.exemplo.com/bone.jpg" });
  });
  it("recusa custo inválido, estoque negativo, nome curto e imagem sem https", () => {
    expect(parseRewardInput({ name: "Boné", points_cost: 0 }).ok).toBe(false);
    expect(parseRewardInput({ name: "Boné", points_cost: 2.5 }).ok).toBe(false);
    expect(parseRewardInput({ name: "Boné", points_cost: 10, stock_quantity: -1 }).ok).toBe(false);
    expect(parseRewardInput({ name: "B", points_cost: 10 }).ok).toBe(false);
    expect(parseRewardInput({ name: "Boné", points_cost: 10, image_url: "http://x.com/a.jpg" }).ok).toBe(false);
    expect(parseRewardInput({ id: "x", name: "Boné", points_cost: 10 }).ok).toBe(false);
  });
});

describe("rewardError", () => {
  it("traduz erros do banco", () => {
    expect(rewardError("AFF_NOT_ENOUGH_POINTS")?.status).toBe(400);
    expect(rewardError("outro erro")).toBeNull();
  });
});
