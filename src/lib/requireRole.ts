import { redirect } from "@tanstack/react-router";
import { getSupabase } from "@/lib/supabase";

type PortalRole = "admin" | "revendedor" | "afiliado";

export async function requireRole(requiredRole: PortalRole) {
  if (typeof window === "undefined") return;

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    throw redirect({ to: "/entrar", search: { admin: requiredRole === "admin" } });
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw redirect({ to: "/entrar", search: { admin: requiredRole === "admin" } });
  }

  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  if (roleError || !roles?.some((item) => item.role === requiredRole)) {
    throw redirect({ to: "/catalogo" });
  }
}
