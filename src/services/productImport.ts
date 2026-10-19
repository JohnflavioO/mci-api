import { apiFetch, ApiError } from "@/lib/api";

/**
 * Importação de produto por link da loja mci.tv.
 * A extração acontece SOMENTE no backend (validação de domínio + proteção SSRF).
 * Os endpoints abaixo ainda não existem na API; a interface trata 404/501 como "aguardando endpoint".
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

export type ImportSaveInput = {
  sourceUrl: string;
  importedAt: string;
  status: "draft" | "published";
  name: string;
  brand: string;
  sku: string;
  description: string;
  specs: { label: string; value: string }[];
  images: string[];
  targetCategory: string;
  salePrice: number | null;
  resellerPricing: { mode: "none" | "percent_off" | "fixed"; value: number | null };
};

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
  preview: async (url: string) =>
    normalizePreview(
      await apiFetch<BackendPreview>(IMPORT_ENDPOINTS.preview, { method: "POST", body: JSON.stringify({ url }) }, 30000),
      url,
    ),
  save: (input: ImportSaveInput) =>
    apiFetch<{ productId: string; status: string }>(IMPORT_ENDPOINTS.save, { method: "POST", body: JSON.stringify(input) }),
};
