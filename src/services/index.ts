import { apiFetch, ApiError } from "@/lib/api";
import { demoProducts, type Product } from "@/lib/demo-data";

/** Saúde da API — único endpoint já existente. */
export const healthService = {
  get: () => apiFetch<{ status: string; db: { status: string } }>("/health"),
};

/** Rotas ainda não implementadas na API: falham de forma explícita, nunca simulam sucesso. */
const pending = (feature: string): Promise<never> =>
  Promise.reject(new ApiError(`${feature} ainda não está disponível na API.`, 501));

export const catalogService = {
  /** Enquanto não há rota de catálogo, retorna somente dados de demonstração. */
  list: async (): Promise<{ products: Product[]; isDemo: true }> => ({ products: demoProducts, isDemo: true }),
  get: async (slug: string): Promise<{ product: Product | null; isDemo: true }> => ({
    product: demoProducts.find((p) => p.slug === slug) ?? null,
    isDemo: true,
  }),
};

export type Role = "cliente" | "revendedor" | "afiliado";

export const authService = {
  login: (_email: string, _password: string) => pending("O login"),
  register: (_role: Role, _data: Record<string, string>) => pending("O cadastro"),
};

export const orderService = {
  create: (_items: { slug: string; qty: number }[]) => pending("A finalização de pedidos"),
  list: () => pending("A lista de pedidos"),
};

export const portalService = {
  section: (area: string, section: string) => pending(`A seção “${section}” de ${area}`),
};
