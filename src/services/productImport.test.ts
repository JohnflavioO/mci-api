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

describe("save error investigation (mocked fetch only, no Oracle writes)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("propaga exatamente o erro interno devolvido pelo servidor em ambos os estados", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: "Erro interno" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { productImportService } = await import("./productImport");
    for (const status of ["draft", "published"] as const) {
      await expect(productImportService.save({ status, sourceUrl: "https://www.mci.tv/p", name: "Produto", brand: "Amaran", sku: "5542", description: "", targetCategory: "Iluminação", specs: [], images: [], customerPrice: 4210, resellerPrice: 2500 })).rejects.toMatchObject({ status: 500, message: "Erro interno" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
