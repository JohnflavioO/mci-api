import { describe, it, expect, vi } from "vitest";
import { fromSupabase, createSupabaseCatalog, type SbProductRow } from "./supabaseCatalog";

const row: SbProductRow = {
  id: "p1", name: "Moving Head", brand: "", sku: "5542", category: "Iluminação", description: null,
  status: "published", row_version: 3,
  product_prices: { currency: "BRL", customer_price: "4210.00" },
  product_reseller_prices: [{ reseller_price: "2500.00" }],
  product_specs: [{ label: "Potência", value: "200W" }, { label: "Vazio", value: "" }],
  product_images: [{ url: "https://x/b.jpg", position: 1 }, { url: "http://x/a.jpg", position: 0 }, { url: "https://x/c.jpg", position: 0 }],
};

describe("fromSupabase", () => {
  it("maps prices from numeric strings", () => {
    const p = fromSupabase(row);
    expect(p.customerPrice).toBe(4210);
    expect(p.resellerPrice).toBe(2500);
    expect(p.currency).toBe("BRL");
  });
  it("keeps rowVersion and status", () => {
    const p = fromSupabase(row);
    expect(p.rowVersion).toBe(3);
    expect(p.status).toBe("published");
  });
  it("orders https images by position and drops non-https", () => {
    expect(fromSupabase(row).images).toEqual(["https://x/c.jpg", "https://x/b.jpg"]);
  });
  it("empty brand becomes null, empty specs are dropped", () => {
    const p = fromSupabase(row);
    expect(p.brand).toBeNull();
    expect(p.specs).toEqual([{ label: "Potência", value: "200W" }]);
  });
  it("missing or zero price is null", () => {
    expect(fromSupabase({ ...row, product_prices: null }).customerPrice).toBeNull();
    expect(fromSupabase({ ...row, product_prices: { currency: "BRL", customer_price: 0 } }).customerPrice).toBeNull();
  });
});

describe("createSupabaseCatalog", () => {
  it("listPublished filters by published and propagates errors", async () => {
    const eq = vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: null, error: { message: "relation missing" } }) });
    const client = { from: () => ({ select: () => ({ eq }) }) };
    const svc = createSupabaseCatalog(() => client as never);
    await expect(svc.listPublished()).rejects.toThrow("relation missing");
    expect(eq).toHaveBeenCalledWith("status", "published");
  });
});
