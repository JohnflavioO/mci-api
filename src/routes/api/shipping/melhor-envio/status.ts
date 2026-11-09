import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/shipping/melhor-envio/status")({
  server: { handlers: {
    GET: async ({ request }) => {
      const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!url || !key || !token) return Response.json({ error: "Sessão administrativa necessária." }, { status: 401 });
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: auth, error } = await client.auth.getUser(token);
      if (error || !auth.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });
      const { data: isAdmin, error: roleError } = await client.rpc("has_role", { _role: "admin" });
      if (roleError || isAdmin !== true) return Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
      const serviceUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
      const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
      if (!serviceUrl || !serviceKey) return Response.json({ error: "Servidor não configurado." }, { status: 503 });
      const admin = createClient(serviceUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error: dbError } = await admin.from("shipping_provider_credentials").select("provider,token_expires_at,scopes,updated_at").eq("provider", "melhor_envio").maybeSingle();
      if (dbError) return Response.json({ error: "Não foi possível consultar a conexão." }, { status: 503 });
      return Response.json({ connected: Boolean(data), tokenExpiresAt: data?.token_expires_at ?? null, scopes: data?.scopes ?? [], updatedAt: data?.updated_at ?? null });
    },
  } },
});
