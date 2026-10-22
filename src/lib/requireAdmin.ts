
import { redirect } from "@tanstack/react-router";
import { getSupabase } from "@/lib/supabase";

export async function requireAdmin() {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw redirect({
      to: "/entrar",
      search: { admin: true },
    });
  }

  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  if (roleError || !roles?.some((item) => item.role === "admin")) {
    await supabase.auth.signOut();

    throw redirect({
      to: "/entrar",
      search: { admin: true },
    });
  }
}
