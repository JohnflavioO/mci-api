import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function config() {
  return { url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "", publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "", serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" };
}
async function authorize(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const c = config();
  if (!c.url || !c.publishableKey || !c.serviceRoleKey) return { response: Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 }) } as const;
  if (!token) return { response: Response.json({ error: "Autenticação necessária." }, { status: 401 }) } as const;
  const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida." }, { status: 401 }) } as const;
  const { data: isAdmin } = await user.rpc("has_role", { _role: "admin" });
  if (isAdmin !== true) return { response: Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) } as const;
  return { actorId: data.user.id, admin: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
}
export const Route = createFileRoute("/api/admin/affiliates")({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [settings, profiles, links, clicks, orders, commissions, ledger, redemptions] = await Promise.all([
        auth.admin.from("affiliate_settings").select("*").eq("id", true).single(),
        auth.admin.from("affiliate_profiles").select("user_id,referral_code,commission_rate,commission_override_pct,status,created_at").order("created_at", { ascending: false }).limit(500),
        auth.admin.from("affiliate_links").select("id,affiliate_id,slug,is_active"),
        auth.admin.from("link_clicks").select("id,link_id").gte("created_at", since).limit(10000),
        auth.admin.from("orders").select("id,affiliate_link_id,status").not("affiliate_link_id", "is", null).gte("created_at", since).limit(10000),
        auth.admin.from("affiliate_commissions").select("id,affiliate_user_id,status,commission_amount").limit(5000),
        auth.admin.from("affiliate_points_ledger").select("affiliate_user_id,points_type,points_delta,created_at,metadata").limit(20000),
        auth.admin.from("affiliate_reward_redemptions").select("id,status,points_cost").limit(1000),
      ]);
      const failed = [settings,profiles,links,clicks,orders,commissions,ledger,redemptions].find((x) => x.error);
      if (failed?.error) return Response.json({ error: "Não foi possível consultar os dados do programa de afiliados." }, { status: 503 });
      const linkOwner = new Map((links.data ?? []).map((x) => [x.id, x.affiliate_id]));
      const clickCounts = new Map<string, number>(), salesCounts = new Map<string, number>(), pending = new Map<string, number>();
      for (const click of clicks.data ?? []) { const owner = linkOwner.get(click.link_id); if (owner) clickCounts.set(owner, (clickCounts.get(owner) ?? 0) + 1); }
      for (const sale of orders.data ?? []) { const owner = sale.status === "paid" && sale.affiliate_link_id ? linkOwner.get(sale.affiliate_link_id) : null; if (owner) salesCounts.set(owner, (salesCounts.get(owner) ?? 0) + 1); }
      for (const row of commissions.data ?? []) if (row.status === "pending") pending.set(row.affiliate_user_id, (pending.get(row.affiliate_user_id) ?? 0) + Number(row.commission_amount));
      const performanceSince = new Date(Date.now() - Number(settings.data.performance_window_days ?? 90) * 86400000).toISOString();
      const balances = new Map<string, { performance: number; reward: number }>();
      for (const row of ledger.data ?? []) {
        const current = balances.get(row.affiliate_user_id) ?? { performance: 0, reward: 0 };
        if (row.points_type === "performance" && row.created_at >= performanceSince) current.performance += Number(row.points_delta);
        if (row.points_type === "reward" && (!row.metadata?.expires_at || new Date(row.metadata.expires_at).getTime() > Date.now())) current.reward += Number(row.points_delta);
        balances.set(row.affiliate_user_id, current);
      }
      const levelRules = Array.isArray(settings.data.levels) ? [...settings.data.levels].sort((a,b) => Number(a.min_points)-Number(b.min_points)) : [];
      const leaderboard = (profiles.data ?? []).filter((p) => p.status === "active").map((p) => {
        const points = balances.get(p.user_id)?.performance ?? 0;
        const level = [...levelRules].reverse().find((item) => points >= Number(item.min_points)) ?? levelRules[0] ?? { name: "Bronze", min_points: 0, commission_pct: 0 };
        return { user_id: p.user_id, name: p.display_name || "Afiliado", points, level: level.name, commission_pct: Number(level.commission_pct), sales30d: salesCounts.get(p.user_id) ?? 0 };
      }).sort((a,b) => b.points-a.points || b.sales30d-a.sales30d || a.name.localeCompare(b.name,"pt-BR")).map((item,index) => ({ ...item, position:index+1 }));
      const clickTotal = clicks.data?.length ?? 0;
      return Response.json({
        settings: settings.data,
        leaderboard,
        affiliates: (profiles.data ?? []).map((p) => ({
          ...p, slug: (links.data ?? []).find((l) => l.affiliate_id === p.user_id)?.slug ?? null,
          clicks30d: clickCounts.get(p.user_id) ?? 0, sales30d: salesCounts.get(p.user_id) ?? 0,
          pendingCommission: pending.get(p.user_id) ?? 0,
          points: balances.get(p.user_id) ?? { performance: 0, reward: 0 },
        })),
        metrics: {
          affiliates: profiles.data?.length ?? 0, clicks: clickTotal,
          commissions: commissions.data?.length ?? 0,
          pendingCommissions: (commissions.data ?? []).filter((x) => x.status === "pending").length,
          commissionTotal: (commissions.data ?? []).reduce((sum, x) => sum + Number(x.commission_amount), 0),
          redemptions: redemptions.data?.length ?? 0,
        },
      });
    },
    PUT: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) return Response.json({ error: "Dados inválidos." }, { status: 400 });
      const { data: old } = await auth.admin.from("affiliate_settings").select("*").eq("id", true).single();
      if (!old) return Response.json({ error: "Configurações não encontradas." }, { status: 503 });
      const allowed = ["enabled","default_commission_pct","attribution_window_days","min_withdrawal","grace_days","block_self_referral","stack_with_coupon","stack_with_volume_discount","stack_with_reseller","stacked_commission_pct","performance_points_per_real","reward_points_per_real","reward_points_enabled"];
      const values: Record<string, unknown> = { updated_by: auth.actorId, updated_at: new Date().toISOString() };
      for (const key of allowed) if (key in body) values[key] = body[key];
      const { data, error } = await auth.admin.from("affiliate_settings").update(values).eq("id", true).select("*").single();
      if (error) return Response.json({ error: "Não foi possível salvar as regras." }, { status: 503 });
      const logs = allowed.filter((key) => key in values && JSON.stringify((old as Record<string,unknown>)[key]) !== JSON.stringify((data as Record<string,unknown>)[key]))
        .map((key) => ({ field:key, old_value:(old as Record<string,unknown>)[key] ?? null, new_value:(data as Record<string,unknown>)[key] ?? null, admin_id:auth.actorId }));
      if (logs.length) await auth.admin.from("affiliate_settings_log").insert(logs);
      return Response.json({ success: true, settings: data });
    },
  }},
});
