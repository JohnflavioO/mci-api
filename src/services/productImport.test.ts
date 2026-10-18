import { describe, expect, it } from "vitest";
import { isMciProductUrl } from "./productImport";

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
