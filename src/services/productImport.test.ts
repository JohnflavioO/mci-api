import { afterEach, describe, expect, it, vi } from "vitest";
import { isMciProductUrl, normalizePreview } from "./productImport";

describe("isMciProductUrl", () => {
  it("aceita link de produto https da www.mci.tv", () => {
    expect(isMciProductUrl("https://www.mci.tv/produto/camera-x")).toBe(true);
  });
  it("recusa outros domínios e endereços internos", () => {
    expect(isMciProductUrl("https://www.mci.tv.evil.com/p")).toBe(false);
    expect(isMciProductUrl("http://127.0.0.1/admin")).toBe(false);
  });
  it("recusa http sem TLS", () => {
    expect(isMciProductUrl("http://www.mci.tv/produto/x")).toBe(false);
  });
});

describe("normalizePreview", () => {
  it("não inventa marca, preço nem categoria", () => {
    const p = normalizePreview({ name: "Câmera", sku: "X1", imageUrl: "https://www.mci.tv/a.jpg", previewOnly: true, savedToDatabase: false }, "https://www.mci.tv/p");
    expect(p.brand).toBeNull();
    expect(p.referencePrice).toBeNull();
    expect(p.sourceCategory).toBeNull();
    expect(p.images).toEqual(["https://www.mci.tv/a.jpg"]);
    expect(p.missingFields).toContain("descrição");
  });
  it("preserva marca, specs, categoria, preço e múltiplas imagens recebidos do backend", () => {
    const p = normalizePreview({
      name: "QuikBeam",
      brand: "Astera",
      sku: "QB-1",
      description: "Projetor LED",
      images: ["https://cdn.mci.tv/a.jpg", "https://cdn.mci.tv/b.jpg", "http://cdn.mci.tv/insegura.jpg"],
      specs: [{ label: "Potência", value: "100 W" }, { label: "", value: "descartar" }, { label: "IP", value: "65" }],
      referencePrice: "1234.50",
      sourceCategory: "Iluminação",
    }, "https://www.mci.tv/p");
    expect(p.brand).toBe("Astera");
    expect(p.specs).toEqual([{ label: "Potência", value: "100 W" }, { label: "IP", value: "65" }]);
    expect(p.images).toEqual(["https://cdn.mci.tv/a.jpg", "https://cdn.mci.tv/b.jpg"]);
    expect(p.referencePrice).toBe(1234.5);
    expect(p.sourceCategory).toBe("Iluminação");
    expect(p.missingFields).toEqual([]);
  });
  it("avisa se o servidor disser que a prévia gravou no banco", () => {
    const p = normalizePreview({ savedToDatabase: true }, "https://www.mci.tv/p");
    expect(p.savedToDatabase).toBe(true);
    expect(p.warnings.length).toBe(1);
  });
});

import { canPublishPrices, toSavePayload } from "./productImport";
describe("toSavePayload", () => {
  const base = { status: "draft" as const, sourceUrl: "https://www.mci.tv/p", name: "X", brand: "", sku: "", description: "", specs: [], images: ["https://www.mci.tv/a.jpg"], targetCategory: "", customerPrice: 200, resellerPrice: 150 };
  it("mapeia preços sem calcular e não envia importedAt", () => {
    const p = toSavePayload(base);
    expect(p.pricing).toEqual({ currency: "BRL", resellerPrice: 150, customerPrice: 200 });
    expect(p.images).toEqual([{ url: "https://www.mci.tv/a.jpg", position: 0 }]);
    expect(p.brand).toBe("");
    expect(p.category).toBeNull();
    expect("importedAt" in p).toBe(false);
  });
  it("publicar exige os dois preços > 0", () => {
    expect(canPublishPrices({ customerPrice: 200, resellerPrice: 0 })).toBe(false);
    expect(canPublishPrices({ customerPrice: 200, resellerPrice: 150 })).toBe(true);
  });
  it("envia marca como string em draft e published, sem inventar marca ausente", () => {
    for (const status of ["draft", "published"] as const) {
      expect(toSavePayload({ ...base, status, brand: "  Amaran  " }).brand).toBe("Amaran");
      expect(toSavePayload({ ...base, status, brand: "   " }).brand).toBe("");
    }
  });
  it("preserva arrays e preços do payload observado, sem cálculos", () => {
    const payload = toSavePayload({ ...base, brand: "Amaran", sku: "5542", targetCategory: "Iluminação", customerPrice: 4210, resellerPrice: 2500 });
    expect(payload.sku).toBe("5542");
    expect(payload.category).toBe("Iluminação");
    expect(payload.specs).toEqual([]);
    expect(payload.images).toEqual([{ url: "https://www.mci.tv/a.jpg", position: 0 }]);
    expect(payload.pricing).toEqual({ currency: "BRL", resellerPrice: 2500, customerPrice: 4210 });
  });
});

describe("importação grava pelo Supabase", () => {
  afterEach(() => vi.doUnmock("@/lib/supabase"));
  it("envia para admin_save_product e traduz SKU duplicado em 409", async () => {
    vi.resetModules();
    const rpc = vi.fn().mockResolvedValueOnce({ data: "id-1", error: null }).mockResolvedValueOnce({ data: null, error: { code: "23505", message: "dup" } });
    vi.doMock("@/lib/supabase", () => ({ getSupabase: () => ({ rpc }) }));
    const { productImportService } = await import("./productImport");
    const input = { status: "draft" as const, sourceUrl: "https://www.mci.tv/p", name: "Produto", brand: "Amaran", sku: "5542", description: "", targetCategory: "Iluminação", specs: [], images: ["https://www.mci.tv/a.jpg"], customerPrice: 4210, resellerPrice: 2500 };
    await expect(productImportService.save(input)).resolves.toEqual({ productId: "id-1", status: "draft" });
    expect(rpc).toHaveBeenCalledWith("admin_save_product", expect.objectContaining({ p_sku: "5542", p_category: "Iluminação", p_image_url: "https://www.mci.tv/a.jpg", p_status: "draft" }));
    await expect(productImportService.save(input)).rejects.toMatchObject({ status: 409 });
  });
});
