import { describe, it, expect } from "vitest";
import { createSupabaseCatalog, fromSupabase, isMissingStockColumn, type SbProductRow } from "./supabaseCatalog";

const base: SbProductRow = { id: "p1", name: "X", brand: null, sku: null, category: "C", description: null, status: "published", row_version: 1 };

function fakeClient(responses: Record<string, { data: unknown; error: unknown }[]>, selects: string[]) {
  const chain = (table: string, sel: string) => {
    selects.push(`${table}:${sel}`);
    const queue = responses[table] ?? [];
    const r = queue.shift() ?? { data: null, error: { code: "42P01", message: "table missing" } };
    const c: Record<string, unknown> = {};
    for (const k of ["eq", "order"]) c[k] = () => c;
    c["maybeSingle"] = () => Promise.resolve(r);
    c["then"] = (f: (v: unknown) => unknown) => Promise.resolve(r).then(f);
    return c;
  };
  return () => ({ from: (table: string) => ({ select: (sel: string) => chain(table, sel) }) }) as never;
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
    const sb = fakeClient({ products: [{ data: null, error: { code: "42703", message: "column products.stock_quantity does not exist" } }, { data: [base], error: null }], platform_settings: [{ data: null, error: { code: "42P01", message: "table missing" } }] }, selects);
    const list = await createSupabaseCatalog(sb).listPublished();
    expect(selects.some((s) => s.includes("products:") && s.includes("stock_quantity"))).toBe(true);
    expect(selects.some((s) => s.startsWith("products:") && !s.includes("stock_quantity"))).toBe(true);
    expect(list[0]!.stock).toBeNull();
  });
  it("outros erros propagam", async () => {
    const sb = fakeClient({ products: [{ data: null, error: { code: "42501", message: "permission denied" } }], platform_settings: [{ data: null, error: { code: "42P01", message: "table missing" } }] }, []);
    await expect(createSupabaseCatalog(sb).listPublished()).rejects.toThrow("permission denied");
    expect(isMissingStockColumn({ code: "42501" })).toBe(false);
  });
});
