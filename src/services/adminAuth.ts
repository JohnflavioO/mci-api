
import { ApiError } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

/**
 * Autentica pelo Supabase Auth e verifica o papel administrativo.
 * Ter e-mail e senha válidos não concede acesso administrativo.
 */
export async function loginAdmin(
  email: string,
  password: string,
): Promise<void> {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    throw new ApiError("E-mail ou senha inválidos.", 401);
  }

  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  if (roleError || !roles?.some((entry) => entry.role === "admin")) {
    await supabase.auth.signOut();
    throw new ApiError(
      "Esta conta não possui acesso administrativo.",
      403,
    );
  }
}
