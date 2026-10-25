import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type UserAction = "suspend" | "reactivate";

function getServerConfig() {
  return {
    url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "",
    publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "",
    serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  };
}

async function authorize(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ?? "";
  const { url, publishableKey, serviceRoleKey } = getServerConfig();
  if (!url || !publishableKey) return { response: Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 }) } as const;
  if (!token) return { response: Response.json({ error: "Autenticação necessária." }, { status: 401 }) } as const;

  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return { response: Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) } as const;

  const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", { _role: "admin" });
  if (roleError || isAdmin !== true) return { response: Response.json({ error: "Acesso restrito ao Super Admin." }, { status: 403 }) } as const;
  if (!serviceRoleKey) return { response: Response.json({ error: "Configure SUPABASE_SERVICE_ROLE_KEY nas variáveis privadas do servidor." }, { status: 503 }) } as const;

  return {
    actorId: authData.user.id,
    url,
    serviceRoleKey,
    adminClient: createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  } as const;
}

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;

        const urlObj = new URL(request.url);
        const page = Math.max(1, Math.min(1000, Number(urlObj.searchParams.get("page") || 1)));
        const perPage = Math.max(1, Math.min(100, Number(urlObj.searchParams.get("perPage") || 100)));
        const { data, error } = await auth.adminClient.auth.admin.listUsers({ page, perPage });
        if (error) return Response.json({ error: "Não foi possível consultar as contas no Supabase Auth." }, { status: 502 });

        const ids = data.users.map((user) => user.id);
        const [rolesResult, resellersResult] = await Promise.all([
          ids.length ? auth.adminClient.from("user_roles").select("user_id,role").in("user_id", ids) : Promise.resolve({ data: [], error: null }),
          ids.length ? auth.adminClient.from("reseller_applications").select("user_id").in("user_id", ids) : Promise.resolve({ data: [], error: null }),
        ]);
        if (rolesResult.error) {
          return Response.json({ error: "Não foi possível identificar os perfis. Verifique a estrutura de public.user_roles." }, { status: 502 });
        }
        // A ausência de um papel explícito significa Cliente; não inferimos privilégios a partir de nome/e-mail.
        const roleMap = new Map<string, string[]>();
        for (const item of rolesResult.data ?? []) {
          const existing = roleMap.get(item.user_id) ?? [];
          existing.push(String(item.role));
          roleMap.set(item.user_id, existing);
        }
        const resellerIds = new Set((resellersResult.data ?? []).map((item) => item.user_id));
        const users = data.users.map((user) => {
          const roles = roleMap.get(user.id) ?? [];
          const role = roles.includes("admin") ? "admin"
            : roles.includes("gestor") ? "gestor"
            : roles.includes("vendedor") ? "vendedor"
            : roles.includes("revendedor") || roles.includes("reseller") || resellerIds.has(user.id) ? "revendedor"
            : roles.includes("afiliado") || roles.includes("affiliate") ? "afiliado"
            : "cliente";
          return {
            id: user.id,
            email: user.email ?? "",
            fullName: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""),
            createdAt: user.created_at,
            lastSignInAt: user.last_sign_in_at ?? null,
            emailConfirmedAt: user.email_confirmed_at ?? null,
            bannedUntil: user.banned_until ?? null,
            role,
            roles,
          };
        });
        return Response.json({ users, page, perPage, total: data.total ?? null });
      },

      POST: async ({ request }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;

        const body = await request.json().catch(() => null) as { userId?: unknown; action?: unknown; reason?: unknown } | null;
        const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
        const action = body?.action;
        const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
          return Response.json({ error: "Identificador de usuário inválido." }, { status: 400 });
        }
        if (action !== "suspend" && action !== "reactivate") return Response.json({ error: "Ação inválida." }, { status: 400 });
        if (reason.length < 5 || reason.length > 1000) return Response.json({ error: "Informe um motivo entre 5 e 1000 caracteres." }, { status: 400 });
        if (action === "suspend" && userId === auth.actorId) {
          return Response.json({ error: "Você não pode suspender a própria conta administrativa." }, { status: 409 });
        }

        const { data: target, error: targetError } = await auth.adminClient.auth.admin.getUserById(userId);
        if (targetError || !target.user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
        const { data: targetRoles, error: targetRoleError } = await auth.adminClient.from("user_roles").select("role").eq("user_id", userId);
        if (targetRoleError) return Response.json({ error: "Não foi possível validar o perfil da conta de destino." }, { status: 502 });
        const isAdmin = (targetRoles ?? []).some((item) => ["admin", "super_admin"].includes(String(item.role)));
        // Protege todas as contas administrativas até existir uma regra explícita para delegação e recuperação.
        if (action === "suspend" && isAdmin) {
          return Response.json({ error: "Contas administrativas não podem ser suspensas por esta tela. Use o fluxo de recuperação administrativa." }, { status: 409 });
        }

        const { error: auditTableError } = await auth.adminClient.from("admin_user_access_audit").select("id").limit(1);\n        if (auditTableError) return Response.json({ error: "A auditoria ainda não está preparada. Aplique a migração supabase/migrations/20261025130000_admin_user_access_audit.sql antes de habilitar ações de acesso." }, { status: 503 });\n\n        const { error: updateError } = await auth.adminClient.auth.admin.updateUserById(userId, {
          ban_duration: action === "suspend" ? "876000h" : "none",
        });
        if (updateError) return Response.json({ error: "Não foi possível alterar o acesso desta conta." }, { status: 502 });

        const { error: auditError } = await auth.adminClient.from("admin_user_access_audit").insert({
          actor_user_id: auth.actorId,
          target_user_id: userId,
          action,
          reason,
        });
        if (auditError) {
          // Não desfaz o bloqueio se a auditoria falhar; sinaliza explicitamente para correção operacional.
          return Response.json({ error: "O acesso foi atualizado, mas não foi possível registrar a auditoria. Verifique a migração admin_user_access_audit." }, { status: 500 });
        }
        return Response.json({ success: true, userId, action });
      },
    },
  },
});
