import { apiFetch, ApiError, hasAuthToken, setAuthToken } from "@/lib/api";

/**
 * Importação de produto por link da loja mci.tv.
 * A extração acontece SOMENTE no backend (validação de domínio + proteção SSRF).
 * A prévia exige um token emitido pelo login administrativo da API.
 */
export const IMPORT_ENDPOINTS = {
  preview: "/admin/products/import/preview",
  save: "/admin/products/import",
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

/** Formato atual retornado pelo backend Fastify (campos podem faltar). */
export type BackendPreview = {
  sourceUrl?: string | null;
  name?: string | null;
  sku?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  previewOnly?: boolean;
  savedToDatabase?: boolean;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Converte a resposta do backend sem inventar dados: o que não veio fica null e vai para missingFields. */
export function normalizePreview(raw: BackendPreview, requestedUrl: string): ImportPreview & { previewOnly: boolean; savedToDatabase: boolean } {
  const name = str(raw.name);
  const sku = str(raw.sku);
  const description = str(raw.description);
  const imageUrl = str(raw.imageUrl);
  const missing: string[] = [];
  if (!name) missing.push("nome");
  if (!sku) missing.push("SKU");
  if (!description) missing.push("descrição");
  if (!imageUrl) missing.push("imagem");
  missing.push("marca", "especificações", "categoria de origem", "preço de referência");
  const warnings: string[] = [];
  if (raw.savedToDatabase === true) warnings.push("Atenção: o servidor informou que a prévia foi gravada. A prévia não deveria salvar dados.");
  return {
    sourceUrl: str(raw.sourceUrl) ?? requestedUrl,
    name, brand: null, sku, description,
    specs: [],
    images: imageUrl && /^https:\/\//.test(imageUrl) ? [imageUrl] : [],
    referencePrice: null,
    sourceCategory: null,
    missingFields: missing,
    warnings,
    duplicates: [],
    previewOnly: raw.previewOnly !== false,
    savedToDatabase: raw.savedToDatabase === true,
  };
}

export const productImportService = {
  preview: async (url: string) => {
    if (!hasAuthToken()) throw new ApiError("Entre como administrador para buscar o produto.", 401);
    try {
      return normalizePreview(
        await apiFetch<BackendPreview>(IMPORT_ENDPOINTS.preview, { method: "POST", body: JSON.stringify({ url }) }, 30000),
        url,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthToken(null);
        throw new ApiError("Sua sessão expirou. Entre novamente como administrador.", 401);
      }
      if (error instanceof ApiError && error.status === 403)
        throw new ApiError("Sua conta não tem autorização para importar produtos.", 403);
      throw error;
    }
  },
  save: (input: ImportSaveInput) => {
    if (input.status === "published" && !canPublishPrices(input))
      return Promise.reject(new ApiError("Para publicar, informe os dois preços maiores que zero.", 400));
    return apiFetch<{ productId: string; status: string }>(IMPORT_ENDPOINTS.save, { method: "POST", body: JSON.stringify(toSavePayload(input)) });
  },
};
