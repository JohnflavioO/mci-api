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
  const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ?? "";
  const { url, publishableKey, serviceRoleKey } = config();
  if (!url || !publishableKey || !serviceRoleKey) {
    return { response: Response.json({ error: "Servidor Supabase não configurado para o módulo de afiliados." }, { status: 503 }) } as const;
  }
  if (!token) return { response: Response.json({ error: "Autenticação necessária." }, { status: 401 }) } as const;
  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) } as const;
  const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", { _role: "admin" });
  if (roleError || isAdmin !== true) return { response: Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) } as const;
  return {
    actorId: data.user.id,
    admin: createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  } as const;
}

const defaults = {
  enabled: false,
  default_commission_rate: 5,
  attribution_window_days: 30,
  minimum_payout: 100,
  performance_points_per_real: 1,
  reward_points_per_real: 1,
  reward_points_enabled: true,
};

export const Route = createFileRoute("/api/admin/affiliates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;
        const [settings, profiles, clicks, commissions, ledger, redemptions] = await Promise.all([
          auth.admin.from("affiliate_program_settings").select("*").eq("id", true).maybeSingle(),
          auth.admin.from("affiliate_profiles").select("user_id,referral_code,commission_rate,status,created_at").order("created_at", { ascending: false }).limit(500),
          auth.admin.from("affiliate_referral_clicks").select("id", { count: "exact", head: true }),
          auth.admin.from("affiliate_commissions").select("id,status,commission_amount", { count: "exact" }).limit(1000),
          auth.admin.from("affiliate_points_ledger").select("affiliate_user_id,points_type,points_delta").limit(5000),
          auth.admin.from("affiliate_reward_redemptions").select("id,status,points_cost", { count: "exact" }).limit(1000),
        ]);
        const failure = [settings, profiles, clicks, commissions, ledger, redemptions].find((item) => item.error);
        if (failure?.error) return Response.json({ error: "A estrutura do programa ainda não está aplicada. Aplique a migração 20261104100000_affiliate_dual_points.sql e tente novamente." }, { status: 503 });
        const balances = new Map<string, { performance: number; reward: number }>();
        for (const row of ledger.data ?? []) {
          const current = balances.get(row.affiliate_user_id) ?? { performance: 0, reward: 0 };
          if (row.points_type === "performance") current.performance += row.points_delta;
          if (row.points_type === "reward") current.reward += row.points_delta;
          balances.set(row.affiliate_user_id, current);
        }
        return Response.json({
          settings: settings.data ?? defaults,
          affiliates: (profiles.data ?? []).map((profile) => ({ ...profile, points: balances.get(profile.user_id) ?? { performance: 0, reward: 0 } })),
          metrics: {
            affiliates: profiles.data?.length ?? 0,
            clicks: clicks.count ?? 0,
            commissions: commissions.data?.length ?? 0,
            pendingCommissions: (commissions.data ?? []).filter((item) => item.status === "pending").length,
            commissionTotal: (commissions.data ?? []).reduce((sum, item) => sum + Number(item.commission_amount), 0),
            redemptions: redemptions.data?.length ?? 0,
          },
        });
      },
      PUT: async ({ request }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;
        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        if (!body) return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
        const commission = Number(body.default_commission_rate);
        const attribution = Number(body.attribution_window_days);
        const payout = Number(body.minimum_payout);
        const performance = Number(body.performance_points_per_real);
        const reward = Number(body.reward_points_per_real);
        if (!Number.isFinite(commission) || commission < 0 || commission > 100 ||
            !Number.isInteger(attribution) || attribution < 1 || attribution > 365 ||
            !Number.isFinite(payout) || payout < 0 ||
            !Number.isFinite(performance) || performance < 0 || performance > 100000 ||
            !Number.isFinite(reward) || reward < 0 || reward > 100000 ||
            typeof body.enabled !== "boolean" || typeof body.reward_points_enabled !== "boolean") {
          return Response.json({ error: "Revise os valores: comissão 0–100%, atribuição 1–365 dias e pontuação não negativa." }, { status: 400 });
        }
        const values = {
          id: true,
          enabled: body.enabled,
          default_commission_rate: commission,
          attribution_window_days: attribution,
          minimum_payout: payout,
          performance_points_per_real: performance,
          reward_points_per_real: reward,
          reward_points_enabled: body.reward_points_enabled,
          updated_at: new Date().toISOString(),
          updated_by: auth.actorId,
        };
        const { data, error } = await auth.admin.from("affiliate_program_settings")
          .upsert(values, { onConflict: "id" }).select("*").single();
        if (error) return Response.json({ error: "Não foi possível salvar as configurações. Verifique se a migração do programa foi aplicada." }, { status: 503 });
        return Response.json({ success: true, settings: data });
      },
    },
  },
});
