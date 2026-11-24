import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isUuid, rewardError } from "@/lib/affiliateRewards";

function config() {
  return { url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "", publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "", serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" };
}
async function authorize(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const c = config();
  if (!c.url || !c.publishableKey || !c.serviceRoleKey) return { response: Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 }) } as const;
  if (!token) return { response: Response.json({ error: "Entre na sua conta." }, { status: 401 }) } as const;
  const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida." }, { status: 401 }) } as const;
  const { data: allowed } = await user.rpc("has_role", { _role: "afiliado" });
  if (allowed !== true) return { response: Response.json({ error: "Acesso restrito a afiliados." }, { status: 403 }) } as const;
  return { userId: data.user.id, db: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
}

export const Route = createFileRoute("/api/affiliate/rewards")({
  server: { handlers: {
    // Saldo de pontos, catálogo ativo, resgates e extrato do afiliado.
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      // Libera comissões vencidas: os pontos de recompensa entram nessa hora.
      await auth.db.rpc("release_affiliate_commissions");
      const [balance, settings, catalog, redemptions, ledger] = await Promise.all([
        auth.db.rpc("affiliate_points_balance", { p_user_id: auth.userId }).single(),
        auth.db.from("affiliate_settings").select("performance_points_per_real,reward_points_per_real,reward_points_enabled,grace_days").eq("id", true).single(),
        auth.db.from("affiliate_reward_catalog").select("id,name,description,points_cost,stock_quantity,image_url").eq("active", true).order("points_cost", { ascending: true }).limit(200),
        auth.db.from("affiliate_reward_redemptions").select("id,reward_id,points_cost,status,created_at,reviewed_at,delivered_at,admin_note,affiliate_reward_catalog(name)").eq("affiliate_user_id", auth.userId).order("created_at", { ascending: false }).limit(50),
        auth.db.from("affiliate_points_ledger").select("id,points_type,points_delta,event_type,description,created_at").eq("affiliate_user_id", auth.userId).order("created_at", { ascending: false }).limit(50),
      ]);
      if (balance.error || settings.error || catalog.error || redemptions.error || ledger.error) {
        return Response.json({ error: "Não foi possível carregar seus pontos." }, { status: 503 });
      }
      const b = balance.data as { performance: number; reward: number };
      return Response.json({
        points: { performance: Number(b.performance ?? 0), reward: Number(b.reward ?? 0) },
        settings: settings.data,
        catalog: catalog.data ?? [],
        redemptions: redemptions.data ?? [],
        ledger: ledger.data ?? [],
      });
    },
    // Pede o resgate de uma recompensa (pontos e estoque ficam reservados).
    POST: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const body = await request.json().catch(() => null) as { reward_id?: unknown } | null;
      if (!isUuid(body?.reward_id)) return Response.json({ error: "Recompensa inválida." }, { status: 400 });
      const { data, error } = await auth.db.rpc("request_affiliate_reward", { p_user_id: auth.userId, p_reward_id: body.reward_id }).single();
      if (error) {
        const known = rewardError(error.message);
        return Response.json({ error: known?.message ?? "Não foi possível registrar o resgate." }, { status: known?.status ?? 503 });
      }
      return Response.json({ redemption: data });
    },
  } },
});
