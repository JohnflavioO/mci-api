import { apiFetch, ApiError, catalogSource, hasAuthToken, setAuthToken } from "@/lib/api";
import { fromApi, type ApiProduct, type CatalogProduct } from "./catalog";

/**
 * Endpoints confirmados na API (out/2026):
 * - GET  /products                     → publicados (público, sem preço de revenda)
 * - POST /admin/products/:id/publish   → publica (Bearer obrigatório)
 * Ainda inexistentes (404): GET /admin/products, POST /admin/products, PUT/PATCH /admin/products/:id.
 */
export const ADMIN_PRODUCT_ENDPOINTS = {
  list: "/products",
  publish: (id: string) => `/admin/products/${encodeURIComponent(id)}/publish`,
} as const;

/** Lista administrativa: sem dados de demonstração — erro real é propagado. */
export async function listPublishedProducts(): Promise<CatalogProduct[]> {
  if (catalogSource() === "supabase") {
    const { createSupabaseCatalog } = await import("./supabaseCatalog");
    return createSupabaseCatalog().listPublished();
  }
  const body = await apiFetch<{ products?: ApiProduct[] }>(ADMIN_PRODUCT_ENDPOINTS.list);
  return (body?.products ?? []).map(fromApi);
}

export function publishErrorMessage(status: number | null, apiMessage: string): string {
  switch (status) {
    case 401: return "Sua sessão expirou. Entre novamente como administrador.";
    case 403: return "Sua conta não tem permissão para publicar produtos.";
    case 404: return "Produto não encontrado.";
    case 409: return `Conflito ao publicar: ${apiMessage}`;
    case 422: return `O produto não pode ser publicado: ${apiMessage}`;
    case null: return apiMessage;
    default: return status >= 500 ? "Erro interno no servidor ao publicar. Nada foi alterado pelo site." : apiMessage;
  }
}

export async function publishProduct(id: string): Promise<unknown> {
  const clean = id.trim();
  if (!clean) throw new ApiError("Informe o ID do produto.", 400);
  if (!hasAuthToken()) throw new ApiError("Entre como administrador para publicar.", 401);
  try {
    return await apiFetch<unknown>(ADMIN_PRODUCT_ENDPOINTS.publish(clean), { method: "POST", body: "{}" });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : null;
    if (status === 401) setAuthToken(null);
    throw new ApiError(publishErrorMessage(status, e instanceof Error ? e.message : "Erro desconhecido"), status);
  }
}
