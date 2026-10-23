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

type LdProduct = {
  name?: unknown;
  sku?: unknown;
  description?: unknown;
  image?: unknown;
  brand?: unknown;
  category?: unknown;
  offers?: unknown;
  additionalProperty?: unknown;
};

function jsonLdProduct(html: string): LdProduct | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1] ?? "");
      const roots = Array.isArray(data) ? data : [data];
      const list = roots.flatMap((root) => {
        if (root && typeof root === "object" && Array.isArray((root as Record<string, unknown>)["@graph"])) {
          return (root as { "@graph": unknown[] })["@graph"];
        }
        return [root];
      }) as Record<string, unknown>[];
      const p = list.find((x) => {
        const type = x?.["@type"];
        return type === "Product" || (Array.isArray(type) && type.includes("Product"));
      });
      if (p) return p as LdProduct;
    } catch { /* ignora bloco inválido */ }
  }
  return null;
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? decode(v) : null);
const asName = (v: unknown): string | null => {
  if (typeof v === "string") return s(v);
  if (v && typeof v === "object") return s((v as Record<string, unknown>).name);
  return null;
};
const httpsUrl = (v: unknown): string | null => {
  const value = s(v);
  if (!value) return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
};
const listOfImages = (v: unknown): string[] => {
  const values = Array.isArray(v) ? v : v == null ? [] : [v];
  return [...new Set(values.map(httpsUrl).filter((x): x is string => !!x))].slice(0, 20);
};
const getPrice = (v: unknown): number | null => {
  const offers = Array.isArray(v) ? v[0] : v;
  if (!offers || typeof offers !== "object") return null;
  const raw = (offers as Record<string, unknown>).price ?? (offers as Record<string, unknown>).lowPrice;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const getSpecs = (v: unknown): { label: string; value: string }[] => {
  const items = Array.isArray(v) ? v : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const obj = item as Record<string, unknown>;
    const label = s(obj.name);
    const value = s(obj.value);
    return label && value ? [{ label, value }] : [];
  }).slice(0, 100);
};

/** Extrai os campos estruturados que a página realmente fornece; não inventa valores. */
export function extractPreview(html: string, sourceUrl: string) {
  const ld = jsonLdProduct(html);
  const images = listOfImages(ld?.image);
  const fallbackImage = httpsUrl(meta(html, "og:image"));
  const allImages = images.length ? images : fallbackImage ? [fallbackImage] : [];
  const brand = asName(ld?.brand);
  const category = s(ld?.category);
  return {
    sourceUrl,
    name: s(ld?.name) ?? meta(html, "og:title"),
    brand,
    sku: s(ld?.sku),
    description: s(ld?.description) ?? meta(html, "og:description"),
    images: allImages,
    imageUrl: allImages[0] ?? null,
    referencePrice: getPrice(ld?.offers),
    sourceCategory: category,
    specs: getSpecs(ld?.additionalProperty),
    previewOnly: true,
    savedToDatabase: false,
  };
}
