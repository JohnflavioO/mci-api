
import { redirect } from "@tanstack/react-router";
import { getSupabase } from "@/lib/supabase";

type AppRole = "admin" | "revendedor" | "afiliado";

export async function requireRole(requiredRole: AppRole) {
  // A sessão Supabase é mantida no navegador.
  // A autorização dos dados deve continuar protegida pelo RLS.
  if (typeof window === "undefined") {
    return;
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw redirect({
      to: "/entrar",
    });
  }

  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  if (roleError || !roles?.some((item) => item.role === requiredRole)) {
    throw redirect({
      to: "/entrar",
    });
  }
}
