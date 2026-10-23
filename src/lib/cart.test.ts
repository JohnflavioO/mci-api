import { describe, expect, it } from "vitest";
import { clampQty } from "./cart";

describe("clampQty", () => {
  it("não permite quantidade acima do estoque", () => expect(clampQty(9, 3)).toBe(3));
  it("mínimo de 1 unidade", () => expect(clampQty(0, 5)).toBe(1));
  it("sem estoque informado não limita", () => expect(clampQty(7, null)).toBe(7));
});
