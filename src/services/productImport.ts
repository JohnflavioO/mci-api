import { ApiError } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

/**
 * Importação de produto por link da loja mci.tv.
 * A extração acontece SOMENTE no backend (validação de domínio + proteção SSRF).
 * A prévia exige um token emitido pelo login administrativo da API.
 */
export const IMPORT_ENDPOINTS = {
  preview: "/api/admin/import-preview",
  save: "admin_save_product",
} as const;

/** Checagem apenas de usabilidade. A validação real de domínio é obrigatória no backend. */
export function isMciProductUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && (u.hostname === "www.mci.tv" || u.hostname === "mci.tv") && u.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Cada campo pode vir ausente (null): nunca preencher com valores inventados. */
export type ImportPreview = {
  sourceUrl: string;
  name: string | null;
  brand: string | null;
  sku: string | null;
  description: string | null;
  specs: { label: string; value: string }[];
  /** URLs externas apenas para pré-visualização; não são armazenadas como arquivos próprios. */
  images: string[];
  referencePrice: number | null;
  sourceCategory: string | null;
  missingFields: string[];
  warnings: string[];
  duplicates: { productId: string; name: string; matchedBy: "url" | "sku" }[];
};

/** Dados editados na tela (preços digitados pelo usuário, nunca calculados). */
export type ImportSaveInput = {
  status: "draft" | "published";
  sourceUrl: string;
  name: string;
  brand: string;
  sku: string;
  description: string;
  specs: { label: string; value: string }[];
  images: string[];
  targetCategory: string;
  customerPrice: number | null;
  resellerPrice: number | null;
};

/** Contrato de POST /admin/products/import. importedAt/createdAt/createdBy são do backend. */
export type ImportSavePayload = {
  status: "draft" | "published";
  sourceUrl: string;
  name: string;
  brand: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  specs: { label: string; value: string }[];
  images: { url: string; position: number }[];
  pricing: { currency: "BRL"; resellerPrice: number | null; customerPrice: number | null };
};

const opt = (v: string) => (v.trim() ? v.trim() : null);

export function toSavePayload(i: ImportSaveInput): ImportSavePayload {
  return {
    status: i.status,
    sourceUrl: i.sourceUrl,
    name: i.name.trim(),
    // The deployed API rejects null for brand (400: Expected string, received null).
    brand: i.brand.trim(),
    sku: opt(i.sku),
    description: opt(i.description),
    category: opt(i.targetCategory),
    specs: i.specs.filter((s) => s.label.trim() && s.value.trim()).map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
    images: i.images.map((url, position) => ({ url, position })),
    pricing: { currency: "BRL", resellerPrice: i.resellerPrice, customerPrice: i.customerPrice },
  };
}

const positive = (n: number | null) => n != null && Number.isFinite(n) && n > 0;
export const canPublishPrices = (i: Pick<ImportSaveInput, "customerPrice" | "resellerPrice">) =>
  positive(i.customerPrice) && positive(i.resellerPrice);

export const isDuplicateError = (e: unknown) => e instanceof ApiError && e.status === 409;

export const isEndpointPending = (e: unknown) =>
  e instanceof ApiError && (e.status === 404 || e.status === 501 || e.status === null);

/** Formato retornado pelo endpoint de prévia. Campos adicionais são opcionais para compatibilidade. */
export type BackendPreview = {
  sourceUrl?: string | null;
  name?: string | null;
  brand?: string | null;
  sku?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  images?: unknown;
  specs?: unknown;
  referencePrice?: unknown;
  sourceCategory?: string | null;
  previewOnly?: boolean;
  savedToDatabase?: boolean;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const safeHttpsUrl = (v: unknown): string | null => {
  const value = str(v);
  if (!value) return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
};
const normalizeImages = (raw: BackendPreview): string[] => {
  const values = Array.isArray(raw.images) ? raw.images : raw.imageUrl ? [raw.imageUrl] : [];
  return [...new Set(values.map(safeHttpsUrl).filter((v): v is string => !!v))].slice(0, 20);
};
const normalizeSpecs = (raw: unknown): { label: string; value: string }[] => {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const label = str((item as Record<string, unknown>).label);
    const value = str((item as Record<string, unknown>).value);
    return label && value ? [{ label, value }] : [];
  }).slice(0, 100);
};
const normalizePrice = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Converte a resposta sem inventar dados; agora preserva marca, specs, categoria, preço e várias imagens. */
export function normalizePreview(raw: BackendPreview, requestedUrl: string): ImportPreview & { previewOnly: boolean; savedToDatabase: boolean } {
  const name = str(raw.name);
  const brand = str(raw.brand);
  const sku = str(raw.sku);
  const description = str(raw.description);
  const images = normalizeImages(raw);
  const specs = normalizeSpecs(raw.specs);
  const referencePrice = normalizePrice(raw.referencePrice);
  const sourceCategory = str(raw.sourceCategory);
  const missing: string[] = [];
  if (!name) missing.push("nome");
  if (!sku) missing.push("SKU");
  if (!description) missing.push("descrição");
  if (!images.length) missing.push("imagem");
  if (!brand) missing.push("marca");
  if (!specs.length) missing.push("especificações");
  if (!sourceCategory) missing.push("categoria de origem");
  if (referencePrice == null) missing.push("preço de referência");
  const warnings: string[] = [];
  if (raw.savedToDatabase === true) warnings.push("Atenção: o servidor informou que a prévia foi gravada. A prévia não deveria salvar dados.");
  return {
    sourceUrl: str(raw.sourceUrl) ?? requestedUrl,
    name, brand, sku, description, specs, images, referencePrice, sourceCategory,
    missingFields: missing,
    warnings,
    duplicates: [],
    previewOnly: raw.previewOnly !== false,
    savedToDatabase: raw.savedToDatabase === true,
  };
}

/** Prévia: rota do próprio site (/api/admin/import-preview), com sessão Supabase e papel admin checado no servidor. */
async function previewRequest(url: string): Promise<BackendPreview> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Entre como administrador para buscar o produto.", 401);
  let res: Response;
  try {
    res = await fetch(IMPORT_ENDPOINTS.preview, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor", null);
  }
  const body = (await res.json().catch(() => null)) as (BackendPreview & { error?: string }) | null;
  if (res.status === 401) throw new ApiError("Sua sessão expirou. Entre novamente como administrador.", 401);
  if (res.status === 403) throw new ApiError("Sua conta não tem autorização para importar produtos.", 403);
  if (!res.ok || !body) throw new ApiError(body?.error ?? `Erro ${res.status}`, res.status);
  return body;
}

export const productImportService = {
  preview: async (url: string) => normalizePreview(await previewRequest(url), url),
  /** A gravação ainda usa a RPC legada, que só persiste uma imagem e não persiste especificações. */
  save: async (input: ImportSaveInput) => {
    if (input.status === "published" && !canPublishPrices(input))
      throw new ApiError("Para publicar, informe os dois preços maiores que zero.", 400);
    const { createSupabaseCatalog } = await import("./supabaseCatalog");
    const p = toSavePayload(input);
    const productId = await createSupabaseCatalog().saveAdmin({
      name: p.name, brand: p.brand, sku: p.sku ?? "", category: p.category ?? "", description: p.description ?? "",
      status: p.status, customerPrice: p.pricing.customerPrice, resellerPrice: p.pricing.resellerPrice,
      imageUrl: p.images[0]?.url ?? "",
    });
    return { productId, status: p.status };
  },
};
