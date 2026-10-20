import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { categoriesOf, filterCatalog, fromApi, type ApiProduct } from "./catalog";

const api: ApiProduct = {
  id: "p-1", name: "Câmera X", brand: null, sku: "CX-1", category: "Câmeras", description: null,
  specs: [{ label: "Zoom", value: "20x" }, { label: "Vazio", value: null }],
  images: [{ url: "https://cdn.test/b.jpg", position: 2 }, { url: "https://cdn.test/a.jpg", position: 1 }, { url: "http://x/c.jpg", position: 3 }],
  pricing: { currency: "BRL", customerPrice: 4210 },
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe("catalog mapping", () => {
  it("uses the id as slug, orders https images by position and never invents stock", () => {
    const p = fromApi(api);
    expect(p.slug).toBe("p-1");
    expect(p.images).toEqual(["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]);
    expect(p.specs).toEqual([{ label: "Zoom", value: "20x" }]);
    expect(p.inStock).toBeNull();
    expect(p.customerPrice).toBe(4210);
  });
  it("treats missing or zero customer price as on request", () => {
    expect(fromApi({ ...api, pricing: null }).customerPrice).toBeNull();
    expect(fromApi({ ...api, pricing: { currency: "BRL", customerPrice: 0 } }).customerPrice).toBeNull();
  });
  it("filters by text, SKU, category and keeps unknown availability", () => {
    const list = [fromApi(api), fromApi({ ...api, id: "p-2", name: "Mesa", sku: "M-2", category: "Áudio" })];
    expect(filterCatalog(list, { q: "cx-1" }).map((p) => p.slug)).toEqual(["p-1"]);
    expect(filterCatalog(list, { categoria: "Áudio" }).map((p) => p.slug)).toEqual(["p-2"]);
    expect(filterCatalog(list, { disponivel: true })).toHaveLength(2);
    expect(categoriesOf(list)).toEqual(["Áudio", "Câmeras"]);
  });
});

describe("catalogService with the API", () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const load = async () => (await import("./catalog")).catalogService;

  it("lists real products from GET /api/v1/products", async () => {
    const f = vi.fn().mockResolvedValue(json({ products: [api] }));
    vi.stubGlobal("fetch", f);
    const r = await (await load()).list();
    expect(f.mock.calls[0]?.[0]).toBe("https://api.example.test/api/v1/products");
    expect(r.isDemo).toBe(false);
    expect(r.products[0]?.name).toBe("Câmera X");
  });
  it("keeps a valid empty list empty (no demo fallback)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ products: [] })));
    expect(await (await load()).list()).toEqual({ products: [], isDemo: false });
  });
  it("falls back to labelled demo data on network failure or 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect((await (await load()).list()).isDemo).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "Erro interno" }, 500)));
    expect((await (await load()).list()).isDemo).toBe(true);
  });
  it("does not mask 401/403 as a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "Proibido" }, 403)));
    await expect((await load()).list()).rejects.toMatchObject({ status: 403 });
  });
  it("gets a product by slug and returns null (not demo) for a real 404", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ product: api })).mockResolvedValueOnce(json({ error: "Produto não encontrado" }, 404));
    vi.stubGlobal("fetch", f);
    const s = await load();
    expect((await s.get("p-1")).product?.sku).toBe("CX-1");
    expect(f.mock.calls[0]?.[0]).toBe("https://api.example.test/api/v1/products/p-1");
    expect(await s.get("camera-ptz-4k")).toEqual({ product: null, isDemo: false });
  });
});
