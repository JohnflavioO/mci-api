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

export const productImportService = {
  preview: (url: string) =>
    apiFetch<ImportPreview>(IMPORT_ENDPOINTS.preview, { method: "POST", body: JSON.stringify({ url }) }, 30000),
  save: (input: ImportSaveInput) =>
    apiFetch<{ productId: string; status: string }>(IMPORT_ENDPOINTS.save, { method: "POST", body: JSON.stringify(input) }),
};
