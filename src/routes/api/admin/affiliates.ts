import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { parseAffiliatePatch } from "@/lib/affiliateAdmin";

function config() {
  return { url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "", publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "", serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" };
}
async function authorize(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const c = config();
  if (!c.url || !c.publishableKey || !c.serviceRoleKey) return { response: Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 }) } as const;
  if (!token) return { response: Response.json({ error: "Autenticação necessária." }, { status: 401 }) } as const;
  // O token do usuário precisa ir junto: has_role() usa auth.uid() e, sem ele, sempre responde false.
  const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida." }, { status: 401 }) } as const;
  const { data: isAdmin, error: roleError } = await user.rpc("has_role", { _role: "admin" });
  if (roleError || isAdmin !== true) return { response: Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) } as const;
  return { actorId: data.user.id, admin: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
}
export const Route = createFileRoute("/api/admin/affiliates")({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [settings, profiles, links, clicks, orders, commissions, ledger, redemptions, products] = await Promise.all([
        auth.admin.from("affiliate_settings").select("*").eq("id", true).single(),
        auth.admin.from("affiliate_profiles").select("user_id,referral_code,commission_rate,commission_override_pct,status,created_at").order("created_at", { ascending: false }).limit(500),
        auth.admin.from("affiliate_links").select("id,affiliate_id,slug,is_active"),
        auth.admin.from("link_clicks").select("id,link_id").gte("created_at", since).limit(10000),
        auth.admin.from("orders").select("id,affiliate_link_id,status").not("affiliate_link_id", "is", null).gte("created_at", since).limit(10000),
        auth.admin.from("affiliate_commissions").select("id,affiliate_user_id,status,commission_amount").limit(5000),
        auth.admin.from("affiliate_points_ledger").select("affiliate_user_id,points_type,points_delta").limit(5000),
        auth.admin.from("affiliate_reward_redemptions").select("id,status,points_cost").limit(1000),
        auth.admin.from("products").select("id,name,sku,status,affiliate_pct").order("name", { ascending: true }).limit(1000),
      ]);
      const failed = [settings,profiles,links,clicks,orders,commissions,ledger,redemptions,products].find((x) => x.error);
      if (failed?.error) return Response.json({ error: "Não foi possível consultar os dados do programa de afiliados." }, { status: 503 });
      const linkOwner = new Map((links.data ?? []).map((x) => [x.id, x.affiliate_id]));
      const clickCounts = new Map<string, number>(), salesCounts = new Map<string, number>(), pending = new Map<string, number>();
      for (const click of clicks.data ?? []) { const owner = linkOwner.get(click.link_id); if (owner) clickCounts.set(owner, (clickCounts.get(owner) ?? 0) + 1); }
      for (const sale of orders.data ?? []) { const owner = sale.status === "paid" && sale.affiliate_link_id ? linkOwner.get(sale.affiliate_link_id) : null; if (owner) salesCounts.set(owner, (salesCounts.get(owner) ?? 0) + 1); }
      for (const row of commissions.data ?? []) if (row.status === "pending") pending.set(row.affiliate_user_id, (pending.get(row.affiliate_user_id) ?? 0) + Number(row.commission_amount));
      const balances = new Map<string, { performance: number; reward: number }>();
      for (const row of ledger.data ?? []) {
        const current = balances.get(row.affiliate_user_id) ?? { performance: 0, reward: 0 };
        if (row.points_type === "performance") current.performance += row.points_delta;
        if (row.points_type === "reward") current.reward += row.points_delta;
        balances.set(row.affiliate_user_id, current);
      }
      const clickTotal = clicks.data?.length ?? 0;
      return Response.json({
        settings: settings.data,
        affiliates: (profiles.data ?? []).map((p) => ({
          ...p, slug: (links.data ?? []).find((l) => l.affiliate_id === p.user_id)?.slug ?? null,
          clicks30d: clickCounts.get(p.user_id) ?? 0, sales30d: salesCounts.get(p.user_id) ?? 0,
          pendingCommission: pending.get(p.user_id) ?? 0,
          points: balances.get(p.user_id) ?? { performance: 0, reward: 0 },
        })),
        products: products.data ?? [],
        metrics: {
          affiliates: profiles.data?.length ?? 0, clicks: clickTotal,
          commissions: commissions.data?.length ?? 0,
          pendingCommissions: (commissions.data ?? []).filter((x) => x.status === "pending").length,
          commissionTotal: (commissions.data ?? []).reduce((sum, x) => sum + Number(x.commission_amount), 0),
          redemptions: redemptions.data?.length ?? 0,
        },
      });
    },
    // Regras gerais do programa são salvas em /api/affiliate/settings (com validação completa).
    // Aqui ficam só as alterações por afiliado e por produto.
    PATCH: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const parsed = parseAffiliatePatch(await request.json().catch(() => null));
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
      const { patch } = parsed;

      const target = patch.kind === "affiliate"
        ? { table: "affiliate_profiles", key: "user_id", id: patch.userId, select: "user_id,status,commission_override_pct" }
        : { table: "products", key: "id", id: patch.productId, select: "id,affiliate_pct" };
      const before = await auth.admin.from(target.table).select(target.select).eq(target.key, target.id).maybeSingle();
      if (before.error) return Response.json({ error: "Não foi possível carregar o registro atual." }, { status: 503 });
      if (!before.data) return Response.json({ error: patch.kind === "affiliate" ? "Afiliado não encontrado." : "Produto não encontrado." }, { status: 404 });

      const values: Record<string, unknown> = { ...patch.values };
      if (patch.kind === "affiliate") values["updated_at"] = new Date().toISOString();
      const after = await auth.admin.from(target.table).update(values).eq(target.key, target.id).select(target.select).single();
      if (after.error) return Response.json({ error: "Não foi possível salvar a alteração." }, { status: 503 });

      const old = before.data as unknown as Record<string, unknown>, now = after.data as unknown as Record<string, unknown>;
      const logs = Object.keys(patch.values)
        .filter((field) => JSON.stringify(old[field] ?? null) !== JSON.stringify(now[field] ?? null))
        .map((field) => ({ field: `${patch.kind}:${target.id}:${field}`, old_value: old[field] ?? null, new_value: now[field] ?? null, admin_id: auth.actorId }));
      if (logs.length) {
        const { error: logError } = await auth.admin.from("affiliate_settings_log").insert(logs);
        if (logError) return Response.json({ error: "A alteração foi salva, mas a auditoria falhou. Avise o suporte." }, { status: 500 });
      }
      return Response.json({ success: true, [patch.kind]: after.data });
    },
  }},
});
