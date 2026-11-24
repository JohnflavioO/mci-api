import { describe, expect, it } from "vitest";
import { parseAffiliatePatch, parsePct } from "./affiliateAdmin";

const ID = "8d2f3a4b-1c2d-4e5f-9a0b-1c2d3e4f5a6b";

describe("parsePct", () => {
  it("aceita vírgula, arredonda para 2 casas e limpa com vazio", () => {
    expect(parsePct("12,345")).toEqual({ ok: true, value: 12.35 });
    expect(parsePct("")).toEqual({ ok: true, value: null });
    expect(parsePct(null)).toEqual({ ok: true, value: null });
  });
  it("recusa fora de 0–100 e texto", () => {
    expect(parsePct(101).ok).toBe(false);
    expect(parsePct(-1).ok).toBe(false);
    expect(parsePct("abc").ok).toBe(false);
  });
});

describe("parseAffiliatePatch", () => {
  it("suspende afiliado e define comissão própria", () => {
    expect(parseAffiliatePatch({ kind: "affiliate", user_id: ID, status: "suspended", commission_override_pct: 15 }))
      .toEqual({ ok: true, patch: { kind: "affiliate", userId: ID, values: { status: "suspended", commission_override_pct: 15 } } });
  });
  it("remove comissão própria com null", () => {
    const r = parseAffiliatePatch({ kind: "affiliate", user_id: ID, commission_override_pct: null });
    expect(r.ok && r.patch.kind === "affiliate" && r.patch.values.commission_override_pct).toBeNull();
  });
  it("recusa status desconhecido, id inválido e corpo vazio", () => {
    expect(parseAffiliatePatch({ kind: "affiliate", user_id: ID, status: "banido" }).ok).toBe(false);
    expect(parseAffiliatePatch({ kind: "affiliate", user_id: "x", status: "active" }).ok).toBe(false);
    expect(parseAffiliatePatch({ kind: "affiliate", user_id: ID }).ok).toBe(false);
    expect(parseAffiliatePatch(null).ok).toBe(false);
  });
  it("define comissão por produto", () => {
    expect(parseAffiliatePatch({ kind: "product", product_id: ID, affiliate_pct: "8" }))
      .toEqual({ ok: true, patch: { kind: "product", productId: ID, values: { affiliate_pct: 8 } } });
    expect(parseAffiliatePatch({ kind: "product", product_id: ID, affiliate_pct: 150 }).ok).toBe(false);
  });
});
