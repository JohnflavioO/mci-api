import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// A listagem usa a Admin API somente no servidor. O navegador nunca recebe a service-role key.
export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
        const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

        if (!url || !publishableKey) {
          return Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 });
        }
        if (!token) return Response.json({ error: "Autenticação necessária." }, { status: 401 });

        const userClient = createClient(url, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: authData, error: authError } = await userClient.auth.getUser(token);
        if (authError || !authData.user) {
          return Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
        }
        const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", { _role: "admin" });
        if (roleError || isAdmin !== true) {
          return Response.json({ error: "Acesso restrito ao Super Admin." }, { status: 403 });
        }
        if (!serviceRoleKey) {
          return Response.json({
            error: "A listagem administrativa ainda não está configurada no servidor. Configure SUPABASE_SERVICE_ROLE_KEY somente nas variáveis privadas do deploy.",
            code: "ADMIN_SERVICE_KEY_MISSING",
          }, { status: 503 });
        }

        const urlObj = new URL(request.url);
        const page = Math.max(1, Math.min(1000, Number(urlObj.searchParams.get("page") || 1)));
        const perPage = Math.max(1, Math.min(100, Number(urlObj.searchParams.get("perPage") || 100)));
        const adminClient = createClient(url, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) {
          return Response.json({ error: "Não foi possível consultar as contas no Supabase Auth." }, { status: 502 });
        }

        const users = data.users.map((user) => ({
          id: user.id,
          email: user.email ?? "",
          fullName: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""),
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at ?? null,
          emailConfirmedAt: user.email_confirmed_at ?? null,
          bannedUntil: user.banned_until ?? null,
          role: typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null,
        }));
        return Response.json({ users, page, perPage, total: data.total ?? null });
      },
    },
  },
});
