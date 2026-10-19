import { describe, expect, it } from "vitest";
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
    expect(p.brand).toBeNull();
    expect(p.category).toBeNull();
    expect("importedAt" in p).toBe(false);
  });
  it("publicar exige os dois preços > 0", () => {
    expect(canPublishPrices({ customerPrice: 200, resellerPrice: 0 })).toBe(false);
    expect(canPublishPrices({ customerPrice: 200, resellerPrice: 150 })).toBe(true);
  });
});
