import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { checkoutProvider } from "@/server/payments/checkout-provider";

export const Route = createFileRoute("/api/admin/payment-settings")({
  server: { handlers: {
    GET: async ({ request }) => {
      const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
      if (!token) return reply({ error: "Autenticação necessária." }, 401);
      const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
      if (!url || !key) return reply({ error: "Servidor não configurado." }, 503);
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: "Bearer " + token } } });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return reply({ error: "Sessão inválida." }, 401);
      const { data: admin, error: roleError } = await client.rpc("has_role", { _role: "admin" });
      if (roleError || admin !== true) return reply({ error: "Acesso restrito ao administrador." }, 403);
      const provider = checkoutProvider();
      return reply({ activeProvider: provider?.name ?? null, redeAvailable: false });
    },
  } },
});
