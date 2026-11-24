import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { parseLoyaltySettings } from "@/lib/loyalty";

function config() {
  return { url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "", publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "", serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" };
}
async function authorize(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const c = config();
  if (!c.url || !c.publishableKey || !c.serviceRoleKey) return { response: Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 }) } as const;
  if (!token) return { response: Response.json({ error: "Autenticação necessária." }, { status: 401 }) } as const;
  const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida." }, { status: 401 }) } as const;
  const { data: isAdmin, error: roleError } = await user.rpc("has_role", { _role: "admin" });
  if (roleError || isAdmin !== true) return { response: Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) } as const;
  return { actorId: data.user.id, admin: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
}

export const Route = createFileRoute("/api/admin/loyalty")({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const [settings, stats] = await Promise.all([
        auth.admin.from("loyalty_settings").select("*").eq("id", true).single(),
        auth.admin.rpc("loyalty_program_stats").single(),
      ]);
      if (settings.error || stats.error) return Response.json({ error: "Não foi possível carregar o Store House Pontos. Confira se o SQL do programa foi aplicado." }, { status: 503 });
      return Response.json({ settings: settings.data, stats: stats.data });
    },
    PUT: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const parsed = parseLoyaltySettings(await request.json().catch(() => null));
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
      const { data, error } = await auth.admin.from("loyalty_settings")
        .update({ ...parsed.settings, updated_by: auth.actorId, updated_at: new Date().toISOString() })
        .eq("id", true).select("*").single();
      if (error) return Response.json({ error: "Não foi possível salvar as regras." }, { status: 503 });
      return Response.json({ settings: data });
    },
  } },
});
