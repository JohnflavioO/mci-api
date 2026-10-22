import { apiFetch, ApiError } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { isIeExempt, isValidCnpj, isValidIe, onlyDigits, UFS } from "@/lib/br-docs";
import { loginAdmin } from "./adminAuth";

/** Retorna a primeira inconsistência do cadastro de revendedor, ou null. */
export function validateReseller(d: Record<string, string>): string | null {
  const uf = d["UF"] ?? "";
  if ((d["Razão social"]?.trim().length ?? 0) < 2) return "Informe a razão social.";
  if (!isValidCnpj(d["CNPJ"] ?? "")) return "CNPJ inválido.";
  if (!(UFS as readonly string[]).includes(uf)) return "Selecione a UF.";
  if (!isValidIe(d["Inscrição Estadual"] ?? "", uf)) return `Inscrição Estadual inválida para ${uf}.`;
  if ((d["Responsável"]?.trim().length ?? 0) < 2) return "Informe o responsável.";
  const phone = onlyDigits(d["Telefone"] ?? "");
  if (phone.length < 10 || phone.length > 11) return "Telefone inválido (DDD + número).";
  return null;
}

export const healthService = {
  get: () =>
    apiFetch<{ status: string; db: { status: string } }>("/health"),
};

export { catalogService } from "./catalog";

export type Role = "cliente" | "revendedor" | "afiliado";

export const authService = {
  login: async (email: string, password: string, admin = false) => {
    if (admin) return loginAdmin(email, password);

    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw new ApiError(
        error.message.includes("Email not confirmed")
          ? "Confirme seu e-mail antes de entrar."
          : "E-mail ou senha inválidos.",
        401,
      );
    }
  },

  register: async (role: Role, data: Record<string, string>) => {
    const supabase = getSupabase();

    const email = data["E-mail"]?.trim().toLowerCase();
    const password = data["Senha"];

    if (!email || !password) {
      throw new ApiError("Informe um e-mail e uma senha válidos.", 400);
    }

    const metadata: Record<string, string> = {
      registration_type: role,
    };

    if (role === "cliente") {
      metadata["full_name"] = data["Nome completo"]?.trim() ?? "";
      metadata["phone"] = data["Telefone"]?.trim() ?? "";
    } else if (role === "revendedor") {
      const problem = validateReseller(data);
      if (problem) throw new ApiError(problem, 400);
      const ie = data["Inscrição Estadual"]?.trim() ?? "";
      metadata["company_name"] = data["Razão social"]?.trim() ?? "";
      metadata["trade_name"] = data["Nome fantasia"]?.trim() ?? "";
      metadata["cnpj"] = onlyDigits(data["CNPJ"] ?? "");
      metadata["state_registration"] = isIeExempt(ie) ? "ISENTO" : onlyDigits(ie);
      metadata["uf"] = data["UF"] ?? "";
      metadata["full_name"] = data["Responsável"]?.trim() ?? "";
      metadata["phone"] = onlyDigits(data["Telefone"] ?? "");
    } else {
      metadata["full_name"] = data["Nome completo"]?.trim() ?? "";
      metadata["cpf"] = data["CPF"]?.trim() ?? "";
      metadata["phone"] = data["Telefone"]?.trim() ?? "";
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });

    if (error) {
      throw new ApiError(
        error.message.includes("already registered")
          ? "Este e-mail já está cadastrado."
          : role === "revendedor" && error.message.includes("Database error")
            ? "Cadastro recusado: este CNPJ já está cadastrado ou os dados não passaram na validação."
            : "Não foi possível criar a conta. Confira os dados e tente novamente.",
        400,
      );
    }
  },
};

export const orderService = {
  create: (_items: { slug: string; qty: number }[]) =>
    Promise.reject(new ApiError("A finalização de pedidos ainda não está disponível na API.", 501)),
  list: () =>
    Promise.reject(new ApiError("A lista de pedidos ainda não está disponível na API.", 501)),
};

export const portalService = {
  section: (area: string, section: string) =>
    Promise.reject(new ApiError(`A seção “${section}” de ${area} ainda não está disponível na API.`, 501)),
};
