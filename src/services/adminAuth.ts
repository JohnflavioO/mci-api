import { ApiError } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

/**
 * Autentica pelo Supabase existente e exige o papel administrativo no banco.
 * Não depende de uma API Node.js externa nem de tokens armazenados em memória.
 */
export async function loginAdmin(email: string, password: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
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

  const { data, error: roleError } = await supabase.rpc("has_role", {
    _role: "admin",
  });

  if (roleError || data !== true) {
    await supabase.auth.signOut();
    throw new ApiError("Esta conta não possui permissão de administrador.", 403);
  }
}
