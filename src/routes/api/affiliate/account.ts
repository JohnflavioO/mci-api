import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function config() {
  return { url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "", publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "", serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" };
}

// Depois que o afiliado salva o nome em "Minha conta", copia o nome do cadastro de login
// para affiliate_profiles.display_name (usado pelo admin nos saques). O valor vem do
// próprio Supabase Auth, nunca do corpo da requisição.
export const Route = createFileRoute("/api/affiliate/account")({
  server: { handlers: {
    POST: async ({ request }) => {
      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const c = config();
      if (!c.url || !c.publishableKey || !c.serviceRoleKey) return Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 });
      if (!token) return Response.json({ error: "Entre na sua conta." }, { status: 401 });
      const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data, error } = await user.auth.getUser(token);
      if (error || !data.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });
      const { data: allowed } = await user.rpc("has_role", { _role: "afiliado" });
      if (allowed !== true) return Response.json({ error: "Acesso restrito a afiliados." }, { status: 403 });
      const meta = data.user.user_metadata ?? {};
      const name = String(meta["full_name"] ?? meta["name"] ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
      if (!name) return Response.json({ success: true });
      const db = createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: updateError } = await db.from("affiliate_profiles")
        .update({ display_name: name, updated_at: new Date().toISOString() }).eq("user_id", data.user.id);
      if (updateError) return Response.json({ error: "Não foi possível atualizar o nome exibido." }, { status: 503 });
      return Response.json({ success: true });
    },
  } },
});
