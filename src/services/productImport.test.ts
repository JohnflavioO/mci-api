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
