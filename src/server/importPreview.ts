/** Extração de prévia de produto da mci.tv. Só servidor; não grava nada. */
export const ALLOWED_HOSTS = new Set(["www.mci.tv", "mci.tv"]);
const MAX_BYTES = 2_000_000;

export function allowedUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname) || u.port || u.username || u.password) return null;
    return u;
  } catch { return null; }
}

/** Busca seguindo no máximo 3 redirects, todos dentro da mci.tv; timeout e limite de tamanho. */
export async function fetchMciPage(raw: string, fetchImpl: typeof fetch = fetch): Promise<{ url: string; html: string }> {
  let url = allowedUrl(raw);
  for (let hop = 0; hop < 4 && url; hop++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetchImpl(url.toString(), { redirect: "manual", signal: ctrl.signal, headers: { Accept: "text/html" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        url = loc ? allowedUrl(new URL(loc, url).toString()) : null;
        continue;
      }
      if (!res.ok) throw new Error(`origem_http_${res.status}`);
      if (!(res.headers.get("content-type") ?? "").includes("text/html")) throw new Error("origem_nao_html");
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) throw new Error("origem_grande_demais");
      return { url: url.toString(), html: new TextDecoder().decode(buf) };
    } finally { clearTimeout(t); }
  }
  throw new Error("url_nao_permitida");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const meta = (html: string, prop: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re); const v = m?.[1] ?? m?.[2];
  return v ? decode(v) || null : null;
};

type LdProduct = { name?: unknown; sku?: unknown; description?: unknown; image?: unknown; brand?: unknown };
function jsonLdProduct(html: string): LdProduct | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1] ?? "");
      const list = (Array.isArray(data) ? data : data?.["@graph"] ?? [data]) as Record<string, unknown>[];
      const p = list.find((x) => x?.["@type"] === "Product");
      if (p) return p as LdProduct;
    } catch { /* ignora bloco inválido */ }
  }
  return null;
}
const s = (v: unknown) => (typeof v === "string" && v.trim() ? decode(v) : null);

/** Mesmo formato que o backend antigo devolvia (BackendPreview); campos ausentes ficam null. */
export function extractPreview(html: string, sourceUrl: string) {
  const ld = jsonLdProduct(html);
  const img = Array.isArray(ld?.image) ? ld?.image[0] : ld?.image;
  const imageUrl = s(img) ?? meta(html, "og:image");
  return {
    sourceUrl,
    name: s(ld?.name) ?? meta(html, "og:title"),
    sku: s(ld?.sku),
    description: s(ld?.description) ?? meta(html, "og:description"),
    imageUrl: imageUrl && /^https:\/\//.test(imageUrl) ? imageUrl : null,
    previewOnly: true,
    savedToDatabase: false,
  };
}
