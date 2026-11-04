import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function serverConfig() {
  return { url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "", publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "", serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" };
}
export const Route = createFileRoute("/api/affiliate/dashboard")({
  server: { handlers: { GET: async ({ request }) => {
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const c = serverConfig();
    if (!c.url || !c.publishableKey || !c.serviceRoleKey) return Response.json({ error: "Portal não configurado." }, { status: 503 });
    if (!token) return Response.json({ error: "Entre na sua conta." }, { status: 401 });
    const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: auth, error } = await user.auth.getUser(token);
    if (error || !auth.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });
    const { data: role } = await user.rpc("has_role", { _role: "afiliado" });
    if (role !== true) return Response.json({ error: "Acesso restrito a afiliados." }, { status: 403 });
    const db = createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [profile, settings, links, commissions, pointsLedger, profiles, rankingLedger] = await Promise.all([
      db.from("affiliate_profiles").select("user_id,referral_code,commission_rate,commission_override_pct,status,display_name").eq("user_id", auth.user.id).single(),
      db.from("affiliate_settings").select("*").eq("id", true).single(),
      db.from("affiliate_links").select("id,product_id,slug,is_active,products(name)").eq("affiliate_id", auth.user.id).order("created_at", { ascending: false }),
      db.from("affiliate_commissions").select("id,order_id,order_total,commission_rate,commission_amount,status,paid_at,payment_reference,created_at").eq("affiliate_user_id", auth.user.id).order("created_at", { ascending: false }).limit(100),
      db.from("affiliate_points_ledger").select("points_type,points_delta,event_type,created_at,metadata").eq("affiliate_user_id", auth.user.id),
      db.from("affiliate_profiles").select("user_id,display_name,status").eq("status", "active").limit(1000),
      db.from("affiliate_points_ledger").select("affiliate_user_id,points_type,points_delta,created_at").eq("points_type", "performance").gte("created_at", new Date(Date.now() - 3650 * 86400000).toISOString()).limit(50000),
    ]);
    if (profile.error || settings.error || links.error || commissions.error || pointsLedger.error || profiles.error || rankingLedger.error) return Response.json({ error: "Não foi possível carregar o painel." }, { status: 503 });
    const linkIds = (links.data ?? []).map((x) => x.id);
    const [clicks, sales] = await Promise.all([
      linkIds.length ? db.from("link_clicks").select("id", { count: "exact", head: true }).in("link_id", linkIds).gte("created_at", since) : Promise.resolve({ count: 0, error: null, data: [] }),
      linkIds.length ? db.from("orders").select("id,affiliate_link_id,total,status,created_at,commission_pct_applied,commission_base_amount").in("affiliate_link_id", linkIds).eq("status", "paid").gte("created_at", since).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ count: 0, error: null, data: [] }),
    ]);
    if (clicks.error || sales.error) return Response.json({ error: "Não foi possível calcular os indicadores." }, { status: 503 });
    const performanceSince = new Date(Date.now() - Number(settings.data.performance_window_days ?? 90) * 86400000).toISOString();
    const performancePoints = (pointsLedger.data ?? []).filter((row) => row.points_type === "performance" && row.created_at >= performanceSince).reduce((sum, row) => sum + Number(row.points_delta), 0);
    const rewardPoints = (pointsLedger.data ?? []).filter((row) => row.points_type === "reward" && (!row.metadata?.expires_at || new Date(row.metadata.expires_at).getTime() > Date.now())).reduce((sum, row) => sum + Number(row.points_delta), 0);
    const points = { performance: performancePoints, reward: rewardPoints };
    const levelRules = Array.isArray(settings.data.levels) ? [...settings.data.levels].sort((a,b) => Number(a.min_points)-Number(b.min_points)) : [];
    const currentLevel = [...levelRules].reverse().find((level) => performancePoints >= Number(level.min_points)) ?? levelRules[0] ?? { name: "—", min_points: 0, commission_pct: Number(settings.data.default_commission_pct) };
    const nextLevel = levelRules.find((level) => Number(level.min_points) > performancePoints) ?? null;
    const salesToNextLevel = nextLevel ? (Number(settings.data.performance_points_per_real) > 0 ? Math.ceil((Number(nextLevel.min_points)-performancePoints)/Number(settings.data.performance_points_per_real)) : null) : 0;
    const rankingBalances = new Map<string, number>();
    for (const row of rankingLedger.data ?? []) if (row.created_at >= performanceSince) rankingBalances.set(row.affiliate_user_id, (rankingBalances.get(row.affiliate_user_id) ?? 0) + Number(row.points_delta));
    const leaderboard = (profiles.data ?? []).map((item) => {
      const points = rankingBalances.get(item.user_id) ?? 0;
      const level = [...levelRules].reverse().find((rule) => points >= Number(rule.min_points)) ?? levelRules[0] ?? { name: "Bronze", commission_pct: 0 };
      const nameParts = (item.display_name || "Afiliado").trim().split(/\s+/);
      const publicName = nameParts.length > 1 ? nameParts[0] + " " + nameParts[nameParts.length - 1][0] + "." : nameParts[0];
      return { is_me: item.user_id === auth.user.id, name: publicName, points, level: level.name, commission_pct: Number(level.commission_pct) };
    }).sort((a,b) => b.points-a.points || a.name.localeCompare(b.name,"pt-BR")).map((item,index) => ({ ...item, position:index+1 }));
    const myPosition = leaderboard.find((item) => item.user_id === auth.user.id)?.position ?? null;
    const pending = (commissions.data ?? []).filter((x) => x.status === "pending").reduce((sum, x) => sum + Number(x.commission_amount), 0);
    const totalClicks = clicks.count ?? 0, totalSales = sales.data?.length ?? 0;
    const linkById = new Map((links.data ?? []).map((link) => [link.id, link]));
    const linksWithClicks = await Promise.all((links.data ?? []).map(async (link) => {
      const { count } = await db.from("link_clicks").select("id", { count: "exact", head: true }).eq("link_id", link.id).gte("created_at", since);
      return { ...link, clicks30d: count ?? 0 };
    }));
    const attributedSales = (sales.data ?? []).map((order) => ({
      ...order,
      product_name: linkById.get(order.affiliate_link_id)?.products?.name ?? "Produto indicado",
      link_slug: linkById.get(order.affiliate_link_id)?.slug ?? "",
    }));
    return Response.json({
      profile: profile.data, settings: settings.data, points, level: { name: currentLevel.name, min_points: Number(currentLevel.min_points), commission_pct: Number(currentLevel.commission_pct), next_name: nextLevel?.name ?? null, next_min_points: nextLevel ? Number(nextLevel.min_points) : null, sales_to_next_level: salesToNextLevel, performance_window_days: Number(settings.data.performance_window_days) },
      metrics: { clicks: totalClicks, sales: totalSales, conversion: totalClicks ? totalSales / totalClicks * 100 : 0, pendingCommission: pending },
      leaderboard: leaderboard.slice(0,10), my_position: myPosition,
      links: linksWithClicks,
      sales: attributedSales,
      commissions: (commissions.data ?? []).slice(0, 10),
    });
  } } },
});
