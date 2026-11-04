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
    const [profile, settings, links, commissions] = await Promise.all([
      db.from("affiliate_profiles").select("user_id,referral_code,commission_rate,commission_override_pct,status,display_name").eq("user_id", auth.user.id).single(),
      db.from("affiliate_settings").select("*").eq("id", true).single(),
      db.from("affiliate_links").select("id,product_id,slug,is_active,products(name)").eq("affiliate_id", auth.user.id).order("created_at", { ascending: false }),
      db.from("affiliate_commissions").select("id,order_id,order_total,commission_rate,commission_amount,status,paid_at,payment_reference,created_at").eq("affiliate_user_id", auth.user.id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (profile.error || settings.error || links.error || commissions.error) return Response.json({ error: "Não foi possível carregar o painel." }, { status: 503 });
    const linkIds = (links.data ?? []).map((x) => x.id);
    const [clicks, sales] = await Promise.all([
      linkIds.length ? db.from("link_clicks").select("id", { count: "exact", head: true }).in("link_id", linkIds).gte("created_at", since) : Promise.resolve({ count: 0, error: null, data: [] }),
      linkIds.length ? db.from("orders").select("id,affiliate_link_id,total,status,created_at,commission_pct_applied,commission_base_amount").in("affiliate_link_id", linkIds).eq("status", "paid").gte("created_at", since).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ count: 0, error: null, data: [] }),
    ]);
    if (clicks.error || sales.error) return Response.json({ error: "Não foi possível calcular os indicadores." }, { status: 503 });
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
      profile: profile.data, settings: settings.data,
      metrics: { clicks: totalClicks, sales: totalSales, conversion: totalClicks ? totalSales / totalClicks * 100 : 0, pendingCommission: pending },
      links: linksWithClicks,
      sales: attributedSales,
      commissions: (commissions.data ?? []).slice(0, 10),
    });
  } } },
});
