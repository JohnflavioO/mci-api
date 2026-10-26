import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MODULES = ["dashboard", "produtos", "estoque", "pedidos", "revendedores", "afiliados", "banners", "configuracoes"] as const;
type ModuleName = typeof MODULES[number];
type ModulePermissions = Partial<Record<ModuleName, { view?: boolean; create?: boolean; edit?: boolean; delete?: boolean }>>;
type AccessLevel = "admin_general" | "operations" | "custom";

function config() {
  return {
    url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "",
    publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "",
    serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
    superAdminId: process.env["SUPER_ADMIN_USER_ID"] ?? "",
  };
}

async function authorize(request: Request) {
  const c = config();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!c.url || !c.publishableKey) return { response: Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 }) } as const;
  if (!token) return { response: Response.json({ error: "Autenticação necessária." }, { status: 401 }) } as const;
  const userClient = createClient(c.url, c.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) } as const;
  if (!c.superAdminId) return { response: Response.json({ error: "Configure SUPER_ADMIN_USER_ID nas variáveis privadas do servidor para habilitar a gestão de administradores." }, { status: 503 }) } as const;
  if (data.user.id !== c.superAdminId) return { response: Response.json({ error: "Somente o Super Admin principal pode gerenciar administradores." }, { status: 403 }) } as const;
  if (!c.serviceRoleKey) return { response: Response.json({ error: "Configure SUPABASE_SERVICE_ROLE_KEY nas variáveis privadas do servidor." }, { status: 503 }) } as const;
  return { actorId: data.user.id, admin: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
}

function validatePermissions(value: unknown): ModulePermissions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !MODULES.includes(key as ModuleName))) return null;
  const result: ModulePermissions = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const actions = raw as Record<string, unknown>;
    if (Object.keys(actions).some((action) => !["view", "create", "edit", "delete"].includes(action))) return null;
    if (Object.values(actions).some((flag) => typeof flag !== "boolean")) return null;
    result[key as ModuleName] = actions as ModulePermissions[ModuleName];
  }
  return result;
}

export const Route = createFileRoute("/api/admin/administrators")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;
        const { data, error } = await auth.admin
          .from("admin_user_permissions")
          .select("user_id,access_level,permissions,created_at,updated_at")
          .order("created_at", { ascending: false });
        if (error) return Response.json({ error: "Não foi possível carregar as permissões. Confirme se a migração admin_management_permissions foi aplicada." }, { status: 503 });
        const ids = (data ?? []).map((row) => row.user_id);
        const users = ids.length ? await Promise.all(ids.map(async (id) => {
          const { data: result } = await auth.admin.auth.admin.getUserById(id);
          const user = result.user;
          const row = (data ?? []).find((item) => item.user_id === id);
          return {
            id,
            email: user?.email ?? "",
            fullName: String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? ""),
            accessLevel: row?.access_level ?? "custom",
            permissions: row?.permissions ?? {},
            createdAt: row?.created_at ?? null,
            emailConfirmedAt: user?.email_confirmed_at ?? null,
          };
        })) : [];
        return Response.json({ administrators: users });
      },
      POST: async ({ request }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;
        const body = await request.json().catch(() => null) as {
          email?: unknown; fullName?: unknown; accessLevel?: unknown; permissions?: unknown;
        } | null;
        const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
        const fullName = typeof body?.fullName === "string" ? body.fullName.trim().slice(0, 120) : "";
        const accessLevel = body?.accessLevel;
        const permissions = validatePermissions(body?.permissions);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
        if (!fullName) return Response.json({ error: "Informe o nome completo." }, { status: 400 });
        if (!["admin_general", "operations", "custom"].includes(String(accessLevel))) return Response.json({ error: "Selecione um nível de acesso válido." }, { status: 400 });
        if (!permissions) return Response.json({ error: "As permissões enviadas são inválidas." }, { status: 400 });
        const { data: invited, error: inviteError } = await auth.admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName, account_type: "admin" },
        });
        if (inviteError || !invited.user) {
          const message = inviteError?.message.toLowerCase().includes("already") ? "Já existe uma conta com esse e-mail." : "Não foi possível enviar o convite. Confira as configurações de e-mail do Supabase.";
          return Response.json({ error: message }, { status: 409 });
        }
        const userId = invited.user.id;
        const { error: roleError } = await auth.admin.from("user_roles").upsert(
          { user_id: userId, role: "admin" },
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );
        if (roleError) {
          await auth.admin.auth.admin.deleteUser(userId);
          return Response.json({ error: "A conta foi criada, mas não foi possível atribuir o papel administrativo. A criação foi revertida." }, { status: 503 });
        }
        const { error: permissionError } = await auth.admin.from("admin_user_permissions").upsert({
          user_id: userId,
          access_level: accessLevel as AccessLevel,
          permissions,
          created_by: auth.actorId,
          updated_by: auth.actorId,
        }, { onConflict: "user_id" });
        if (permissionError) {
          await auth.admin.auth.admin.deleteUser(userId);
          return Response.json({ error: "A estrutura de permissões não está disponível. A criação da conta foi revertida; aplique a migração antes de tentar novamente." }, { status: 503 });
        }
        return Response.json({ success: true, user: { id: userId, email, fullName, accessLevel } }, { status: 201 });
      },
    },
  },
});
