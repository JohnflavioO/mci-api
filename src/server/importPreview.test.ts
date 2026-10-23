import { describe, expect, it, vi } from "vitest";
import { allowedUrl, extractPreview, fetchMciPage } from "./importPreview";
import { canSell } from "@/lib/cart";

describe("importação: segurança da busca", () => {
  it("só aceita https da mci.tv", () => {
    expect(allowedUrl("https://www.mci.tv/p/x")).not.toBeNull();
    expect(allowedUrl("http://www.mci.tv/p")).toBeNull();
    expect(allowedUrl("https://mci.tv.evil.com/p")).toBeNull();
    expect(allowedUrl("https://www.mci.tv:8443/p")).toBeNull();
    expect(allowedUrl("https://u:p@www.mci.tv/p")).toBeNull();
  });
  it("não segue redirect para fora do domínio", async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    await expect(fetchMciPage("https://www.mci.tv/p", f as unknown as typeof fetch)).rejects.toThrow("url_nao_permitida");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("extrai sem inventar campos", () => {
    const html = `<meta property="og:title" content="Luz &amp; Cia"><script type="application/ld+json">{"@type":"Product","sku":"5541","image":["https://cdn.mci.tv/a.jpg"]}</script>`;
    const p = extractPreview(html, "https://www.mci.tv/p");
    expect(p).toMatchObject({ name: "Luz & Cia", sku: "5541", imageUrl: "https://cdn.mci.tv/a.jpg", description: null, savedToDatabase: false });
  });
});

describe("venda só com estoque conhecido", () => {
  it("estoque não informado ou zero não vende", () => {
    expect(canSell({ stock: null })).toBe(false);
    expect(canSell({})).toBe(false);
    expect(canSell({ stock: 0 })).toBe(false);
    expect(canSell({ stock: 3 })).toBe(true);
    expect(canSell({ stock: 3, inStock: false })).toBe(false);
  });
});
