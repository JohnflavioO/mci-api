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
  const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
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
  "max_total_affiliate_cost_pct", "reward_point_value_brl", "reward_points_expiry_months",
  "reward_min_redeem_points", "performance_window_days", "simulation_sale_value", "commission_cap_per_order", "levels",
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
        const performancePoints = Number(values.performance_points_per_real ?? old.performance_points_per_real);
        const rewardPoints = Number(values.reward_points_per_real ?? old.reward_points_per_real);
        if (!Number.isFinite(performancePoints) || performancePoints < 0 || !Number.isFinite(rewardPoints) || rewardPoints < 0) {
          return Response.json({ error: "A pontuação por real deve ser um número maior ou igual a zero." }, { status: 400 });
        }
        const ceiling = Number(values.max_total_affiliate_cost_pct ?? old.max_total_affiliate_cost_pct ?? 2);
        const rewardValue = Number(values.reward_point_value_brl ?? old.reward_point_value_brl ?? 0.0025);
        const expiryMonths = Number(values.reward_points_expiry_months ?? old.reward_points_expiry_months ?? 12);
        const minRedeem = Number(values.reward_min_redeem_points ?? old.reward_min_redeem_points ?? 20000);
        const windowDays = Number(values.performance_window_days ?? old.performance_window_days ?? 90);
        const simulationValue = Number(values.simulation_sale_value ?? old.simulation_sale_value ?? 2500);
        const commissionCap = Number(values.commission_cap_per_order ?? old.commission_cap_per_order ?? 100);
        const levels = (values.levels ?? old.levels) as unknown;
        if (!Number.isFinite(ceiling) || ceiling < 0 || ceiling > 100 || !Number.isFinite(rewardValue) || rewardValue < 0 || !Number.isInteger(expiryMonths) || expiryMonths < 1 || expiryMonths > 120 || !Number.isInteger(minRedeem) || minRedeem < 0 || !Number.isInteger(windowDays) || windowDays < 1 || windowDays > 3650 || !Number.isFinite(simulationValue) || simulationValue < 0 || !Number.isFinite(commissionCap) || commissionCap < 0) return Response.json({ error: "Revise os limites de custo, validade, janela, valor de simulação e teto de comissão." }, { status: 400 });
        if (ceiling > Number(old.max_total_affiliate_cost_pct ?? 2)) {
          const { data: allowed, error: permissionError } = await auth.db.rpc("has_affiliate_permission", { p_user_id: auth.actorId, p_permission: "affiliate.settings.edit_ceiling" });
          if (permissionError || allowed !== true) return Response.json({ error: "Aumentar o teto de custo exige a permissão affiliate.settings.edit_ceiling." }, { status: 403 });
        }
        if (!Array.isArray(levels) || levels.length < 1 || levels.length > 20) return Response.json({ error: "Cadastre entre 1 e 20 níveis." }, { status: 400 });
        const normalizedLevels = levels.map((item) => { const row = item as { name?: unknown; min_points?: unknown; commission_pct?: unknown }; return { name: typeof row.name === "string" ? row.name.trim() : "", min_points: Number(row.min_points), commission_pct: Number(row.commission_pct) }; });
        if (normalizedLevels.some((row) => !row.name || row.name.length > 40 || !Number.isInteger(row.min_points) || row.min_points < 0 || !Number.isFinite(row.commission_pct) || row.commission_pct < 0 || row.commission_pct > 100)) return Response.json({ error: "Cada nível precisa de nome, pontos inteiros não negativos e comissão entre 0 e 100%." }, { status: 400 });
        normalizedLevels.sort((a,b) => a.min_points - b.min_points);
        if (normalizedLevels[0].min_points !== 0 || normalizedLevels.some((row,i) => i > 0 && (row.min_points <= normalizedLevels[i-1].min_points || normalizedLevels.slice(0,i).some((prev) => prev.name.toLowerCase() === row.name.toLowerCase())))) return Response.json({ error: "Os níveis devem começar em 0 ponto e ter faixas crescentes, sem nomes repetidos." }, { status: 400 });
        const rewardCostPct = (values.reward_points_enabled ?? old.reward_points_enabled) === true ? rewardPoints * rewardValue * 100 : 0;
        const violating = normalizedLevels.find((level) => level.commission_pct + rewardCostPct > ceiling + 0.000001);
        if (violating) return Response.json({ error: `Nível "${violating.name}" viola o teto: comissão ${violating.commission_pct.toLocaleString("pt-BR")}% + custo de recompensa ${rewardCostPct.toLocaleString("pt-BR",{maximumFractionDigits:4})}% = ${(violating.commission_pct + rewardCostPct).toLocaleString("pt-BR",{maximumFractionDigits:4})}%, acima do limite de ${ceiling.toLocaleString("pt-BR")}%.` }, { status: 400 });
        values.levels = normalizedLevels;
        values.max_total_affiliate_cost_pct = ceiling;
        values.reward_point_value_brl = rewardValue;
        values.reward_points_expiry_months = expiryMonths;
        values.reward_min_redeem_points = minRedeem;
        values.performance_window_days = windowDays;
        values.simulation_sale_value = simulationValue;
        values.commission_cap_per_order = commissionCap;
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
