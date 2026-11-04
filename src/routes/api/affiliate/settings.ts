import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function config() {
  return {
    url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "",
    publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "",
    serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  };
}

async function authorize(request: Request) {
  const bearer = request.headers.get("authorization") ?? "";
  const token = bearer.replace(/^Bearer\s+/i, "");
  const c = config();
  if (!c.url || !c.publishableKey || !c.serviceRoleKey) return { response: Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 }) } as const;
  if (!token) return { response: Response.json({ error: "Autenticação necessária." }, { status: 401 }) } as const;
  const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida." }, { status: 401 }) } as const;
  const [adminRole, affiliateRole] = await Promise.all([
    user.rpc("has_role", { _role: "admin" }),
    user.rpc("has_role", { _role: "afiliado" }),
  ]);
  if (adminRole.error || affiliateRole.error || (adminRole.data !== true && affiliateRole.data !== true)) {
    return { response: Response.json({ error: "Acesso não autorizado." }, { status: 403 }) } as const;
  }
  return {
    actorId: data.user.id,
    isAdmin: adminRole.data === true,
    db: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  } as const;
}

const editable = [
  "attribution_window_days", "attribution_model", "default_commission_pct", "commission_base",
  "grace_days", "min_withdrawal", "block_self_referral", "stack_with_coupon",
  "stack_with_volume_discount", "stack_with_reseller", "stacked_commission_pct",
  "enabled", "performance_points_per_real", "reward_points_per_real", "reward_points_enabled",
] as const;

export const Route = createFileRoute("/api/affiliate/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;
        const { data, error } = await auth.db.from("affiliate_settings").select("*").eq("id", true).single();
        if (error) return Response.json({ error: "Regras de afiliados não encontradas." }, { status: 503 });
        return Response.json({ settings: data });
      },
      PUT: async ({ request }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;
        if (!auth.isAdmin) return Response.json({ error: "Somente administradores podem alterar as regras." }, { status: 403 });
        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        if (!body) return Response.json({ error: "Dados inválidos." }, { status: 400 });
        const oldResult = await auth.db.from("affiliate_settings").select("*").eq("id", true).single();
        if (oldResult.error) return Response.json({ error: "Não foi possível carregar as regras atuais." }, { status: 503 });
        const old = oldResult.data as Record<string, unknown>;
        const values: Record<string, unknown> = {};
        for (const key of editable) if (key in body) values[key] = body[key];
        const pct = Number(values.default_commission_pct ?? old.default_commission_pct);
        const stacked = Number(values.stacked_commission_pct ?? old.stacked_commission_pct);
        const days = Number(values.attribution_window_days ?? old.attribution_window_days);
        const grace = Number(values.grace_days ?? old.grace_days);
        const withdrawal = Number(values.min_withdrawal ?? old.min_withdrawal);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100 || !Number.isFinite(stacked) || stacked < 0 || stacked > 100 ||
            !Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(grace) || grace < 1 || grace > 365 ||
            !Number.isFinite(withdrawal) || withdrawal < 0) {
          return Response.json({ error: "Comissões devem ficar entre 0 e 100%, dias entre 1 e 365 e saque mínimo não pode ser negativo." }, { status: 400 });
        }
        if (values.attribution_model !== undefined && values.attribution_model !== "last_click") return Response.json({ error: "Modelo de atribuição inválido." }, { status: 400 });
        if (values.commission_base !== undefined && values.commission_base !== "net") return Response.json({ error: "Base de comissão inválida." }, { status: 400 });
        for (const key of ["block_self_referral","stack_with_coupon","stack_with_volume_discount","stack_with_reseller","enabled","reward_points_enabled"] as const) {
          if (key in values && typeof values[key] !== "boolean") return Response.json({ error: "Revise os campos de ativação." }, { status: 400 });
        }
        values.updated_by = auth.actorId;
        values.updated_at = new Date().toISOString();
        const { data, error } = await auth.db.from("affiliate_settings").update(values).eq("id", true).select("*").single();
        if (error) return Response.json({ error: "Não foi possível salvar as regras." }, { status: 503 });
        const logs = editable.filter((key) => key in values && JSON.stringify(old[key]) !== JSON.stringify((data as Record<string, unknown>)[key]))
          .map((key) => ({ field: key, old_value: old[key] ?? null, new_value: (data as Record<string, unknown>)[key] ?? null, admin_id: auth.actorId }));
        if (logs.length) {
          const { error: logError } = await auth.db.from("affiliate_settings_log").insert(logs);
          if (logError) return Response.json({ error: "As regras foram salvas, mas a auditoria falhou. Avise o suporte." }, { status: 500 });
        }
        return Response.json({ success: true, settings: data });
      },
    },
  },
});
