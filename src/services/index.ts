import { apiFetch, ApiError } from "@/lib/api";
import { loginAdmin } from "./adminAuth";

/** Saúde da API — único endpoint já existente. */
export const healthService = {
  get: () => apiFetch<{ status: string; db: { status: string } }>("/health"),
};

/** Rotas ainda não implementadas na API: falham de forma explícita, nunca simulam sucesso. */
const pending = (feature: string): Promise<never> =>
  Promise.reject(new ApiError(`${feature} ainda não está disponível na API.`, 501));

export { catalogService } from "./catalog";

export type Role = "cliente" | "revendedor" | "afiliado";

export const authService = {
  login: (email: string, password: string, admin = false) =>
    admin ? loginAdmin(email, password) : pending("O login"),
  register: (_role: Role, _data: Record<string, string>) => pending("O cadastro"),
};

export const orderService = {
  create: (_items: { slug: string; qty: number }[]) => pending("A finalização de pedidos"),
  list: () => pending("A lista de pedidos"),
};

export const portalService = {
  section: (area: string, section: string) => pending(`A seção “${section}” de ${area}`),
};
