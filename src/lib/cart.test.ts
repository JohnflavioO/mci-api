import { describe, expect, it } from "vitest";
import { canSell, clampQty } from "./cart";

describe("clampQty", () => {
  it("não permite quantidade acima do estoque", () => expect(clampQty(9, 3)).toBe(3));
  it("mínimo de 1 unidade", () => expect(clampQty(0, 5)).toBe(1));
  it("sem estoque informado não limita", () => expect(clampQty(7, null)).toBe(7));
});

describe("disponibilidade com confirmação de estoque", () => {
  it("bloqueia estoque não informado ou zerado", () => {
    expect(canSell({ stock: null })).toBe(false);
    expect(canSell({ stock: 0 })).toBe(false);
  });
  it("exige confirmação explícita quando o modo manual está ativo", () => {
    expect(canSell({ stock: 5, stockConfirmed: false })).toBe(false);
    expect(canSell({ stock: 5, stockConfirmed: true })).toBe(true);
  });
  it("permite quantidade positiva quando o modo manual foi dispensado", () => {
    // O serviço do catálogo representa o modo dispensado com stockConfirmed=true.
    expect(canSell({ stock: 2, stockConfirmed: true })).toBe(true);
  });
});
