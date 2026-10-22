
import { redirect } from "@tanstack/react-router";
import { getSupabase } from "@/lib/supabase";

type PortalRole = "admin" | "revendedor" | "afiliado";

export function requireRole(requiredRole: PortalRole) {
  return async function checkRole() {
    if (typeof window === "undefined") {
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      throw redirect({
        to: "/entrar",
        search: { admin: requiredRole === "admin" },
      });
    }

    const { data: roles, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    if (
      roleError ||
      !roles?.some((item) => item.role === requiredRole)
    ) {
      throw redirect({
        to: "/entrar",
        search: { admin: requiredRole === "admin" },
      });
    }
  };
}
