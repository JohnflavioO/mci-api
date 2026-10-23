import { describe, it, expect } from "vitest";
import { createSupabaseCatalog, fromSupabase, isMissingStockColumn, type SbProductRow } from "./supabaseCatalog";

const base: SbProductRow = { id: "p1", name: "X", brand: null, sku: null, category: "C", description: null, status: "published", row_version: 1 };

function fakeClient(responses: { data: unknown; error: unknown }[], selects: string[]) {
  const chain = (sel: string) => {
    selects.push(sel);
    const r = responses.shift()!;
    const c: Record<string, unknown> = {};
    for (const k of ["eq", "order"]) c[k] = () => c;
    c["maybeSingle"] = () => Promise.resolve(r);
    c["then"] = (f: (v: unknown) => unknown) => Promise.resolve(r).then(f);
    return c;
  };
  return () => ({ from: () => ({ select: chain }) }) as never;
}

describe("estoque no catálogo Supabase", () => {
  it("lê stock_quantity quando existe", () => {
    expect(fromSupabase({ ...base, stock_quantity: 3 }).stock).toBe(3);
    expect(fromSupabase({ ...base, stock_quantity: 0 }).inStock).toBe(false);
  });
  it("estoque não informado continua null", () => {
    expect(fromSupabase({ ...base, stock_quantity: null }).stock).toBeNull();
    expect(fromSupabase(base).inStock).toBeNull();
  });
  it("seleciona stock_quantity e refaz sem ele se a coluna não existir (0004 pendente)", async () => {
    const selects: string[] = [];
    const sb = fakeClient([{ data: null, error: { code: "42703", message: "column products.stock_quantity does not exist" } }, { data: [base], error: null }], selects);
    const list = await createSupabaseCatalog(sb).listPublished();
    expect(selects[0]).toContain("stock_quantity");
    expect(selects[1]).not.toContain("stock_quantity");
    expect(list[0]!.stock).toBeNull();
  });
  it("outros erros propagam", async () => {
    const sb = fakeClient([{ data: null, error: { code: "42501", message: "permission denied" } }], []);
    await expect(createSupabaseCatalog(sb).listPublished()).rejects.toThrow("permission denied");
    expect(isMissingStockColumn({ code: "42501" })).toBe(false);
  });
});
