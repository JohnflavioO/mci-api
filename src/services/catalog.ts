import { apiFetch, ApiError, catalogSource } from "@/lib/api";
import { demoProducts, type Product as DemoProduct } from "@/lib/demo-data";

/** Contrato público de GET /products e GET /products/:id (ver backend/src/products.ts). */
export type ApiProduct = {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  category: string;
  description: string | null;
  specs: { label: string; value: string | null }[];
  images: { url: string; position: number }[];
  pricing: { currency: string; customerPrice: number | null } | null;
};

/** Modelo usado pelas telas. `inStock` null = a API não informa estoque. */
export type CatalogProduct = {
  slug: string;
  name: string;
  brand: string | null;
  sku: string | null;
  category: string;
  description: string | null;
  specs: { label: string; value: string }[];
  images: string[];
  inStock: boolean | null;
  customerPrice: number | null;
  currency: string | null;
};

export type CatalogList = { products: CatalogProduct[]; isDemo: boolean };
export type CatalogItem = { product: CatalogProduct | null; isDemo: boolean };

const isHttpsUrl = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};

export function fromApi(p: ApiProduct): CatalogProduct {
  const price = p.pricing?.customerPrice;
  return {
    slug: p.id,
    name: p.name,
    brand: p.brand,
    sku: p.sku,
    category: p.category,
    description: p.description,
    specs: (p.specs ?? []).filter((s) => s.value != null && s.value !== "").map((s) => ({ label: s.label, value: s.value as string })),
    images: [...(p.images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url).filter(isHttpsUrl),
    inStock: null,
    customerPrice: typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null,
    currency: p.pricing?.currency ?? null,
  };
}

export function fromDemo(p: DemoProduct): CatalogProduct {
  return {
    slug: p.slug, name: p.name, brand: p.brand, sku: null, category: p.category, description: p.description,
    specs: Object.entries(p.specs).map(([label, value]) => ({ label, value })),
    images: [], inStock: p.inStock, customerPrice: null, currency: null,
  };
}

/** Só falha de rede, 5xx ou rota ainda não implantada (404/501) usam a demonstração. 401/403/400 propagam. */
const shouldFallback = (e: unknown) =>
  e instanceof ApiError && (e.status === null || e.status === 404 || e.status === 501 || e.status >= 500);

export const demoList = (): CatalogList => ({ products: demoProducts.map(fromDemo), isDemo: true });

/** Leitura via API Oracle (origem padrão). */
export const oracleCatalogService = {
  list: async (): Promise<CatalogList> => {
    try {
      const body = await apiFetch<{ products?: ApiProduct[] }>("/products");
      return { products: (body?.products ?? []).map(fromApi), isDemo: false };
    } catch (e) {
      if (shouldFallback(e)) return demoList();
      throw e;
    }
  },
  get: async (slug: string): Promise<CatalogItem> => {
    try {
      const body = await apiFetch<{ product?: ApiProduct }>(`/products/${encodeURIComponent(slug)}`);
      return { product: body?.product ? fromApi(body.product) : null, isDemo: false };
    } catch (e) {
      // 404 vindo da API real = produto inexistente ou não público. Nunca trocar por demonstração.
      if (e instanceof ApiError && e.status === 404 && !e.message.startsWith("Não encontrado")) return { product: null, isDemo: false };
      if (!shouldFallback(e)) throw e;
      const demo = demoProducts.find((p) => p.slug === slug);
      return { product: demo ? fromDemo(demo) : null, isDemo: true };
    }
  },
};

/** Leitura via Supabase próprio: sem fallback demo — erros reais propagam. */
export const supabaseCatalogService = {
  list: async (): Promise<CatalogList> => {
    const { createSupabaseCatalog } = await import("./supabaseCatalog");
    return { products: await createSupabaseCatalog().listPublished(), isDemo: false };
  },
  get: async (slug: string): Promise<CatalogItem> => {
    const { createSupabaseCatalog } = await import("./supabaseCatalog");
    return { product: await createSupabaseCatalog().get(slug), isDemo: false };
  },
};

/** Seleção explícita por VITE_CATALOG_SOURCE; Oracle é o padrão. */
export const catalogService = {
  list: () => (catalogSource() === "supabase" ? supabaseCatalogService : oracleCatalogService).list(),
  get: (slug: string) => (catalogSource() === "supabase" ? supabaseCatalogService : oracleCatalogService).get(slug),
};

/** Categorias derivadas dos produtos exibidos (sem lista fixa quando conectado). */
export const categoriesOf = (list: CatalogProduct[]) =>
  [...new Set(list.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

export const formatPrice = (value: number, currency: string | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency ?? "BRL" }).format(value);

export const filterCatalog = (list: CatalogProduct[], f: { q?: string | undefined; categoria?: string | undefined; disponivel?: boolean | undefined }) => {
  const term = (f.q ?? "").toLowerCase();
  return list.filter((p) =>
    (!term || p.name.toLowerCase().includes(term) || (p.sku ?? "").toLowerCase().includes(term)) &&
    (!f.categoria || p.category === f.categoria) &&
    (!f.disponivel || p.inStock !== false));
};
