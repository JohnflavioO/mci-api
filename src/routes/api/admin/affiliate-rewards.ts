import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isUuid, parseRewardInput, rewardError } from "@/lib/affiliateRewards";

function config() {
  return { url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "", publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "", serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" };
}
async function authorize(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const c = config();
  if (!c.url || !c.publishableKey || !c.serviceRoleKey) return { response: Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 }) } as const;
  if (!token) return { response: Response.json({ error: "Autenticação necessária." }, { status: 401 }) } as const;
  const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida." }, { status: 401 }) } as const;
  const { data: isAdmin, error: roleError } = await user.rpc("has_role", { _role: "admin" });
  if (roleError || isAdmin !== true) return { response: Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) } as const;
  return { actorId: data.user.id, admin: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
}

export const Route = createFileRoute("/api/admin/affiliate-rewards")({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const [catalog, redemptions] = await Promise.all([
        auth.admin.from("affiliate_reward_catalog").select("id,name,description,points_cost,stock_quantity,active,image_url,updated_at").order("active", { ascending: false }).order("points_cost", { ascending: true }).limit(500),
        auth.admin.from("affiliate_reward_redemptions").select("id,affiliate_user_id,reward_id,points_cost,status,created_at,reviewed_at,delivered_at,admin_note,affiliate_reward_catalog(name),affiliate_profiles(display_name)").order("created_at", { ascending: false }).limit(300),
      ]);
      if (catalog.error || redemptions.error) return Response.json({ error: "Não foi possível carregar as recompensas." }, { status: 503 });
      // E-mail de quem tem resgate em aberto, para o admin combinar a entrega.
      const open = (redemptions.data ?? []).filter((r) => r.status === "requested" || r.status === "approved");
      const emails = new Map<string, string>();
      await Promise.all([...new Set(open.map((r) => r.affiliate_user_id))].map(async (id) => {
        const { data } = await auth.admin.auth.admin.getUserById(id);
        if (data.user?.email) emails.set(id, data.user.email);
      }));
      return Response.json({
        catalog: catalog.data ?? [],
        redemptions: (redemptions.data ?? []).map((r) => ({ ...r, email: emails.get(r.affiliate_user_id) ?? null })),
      });
    },
    // Cria ou edita uma recompensa do catálogo.
    PUT: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const parsed = parseRewardInput(await request.json().catch(() => null));
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
      const { id, ...values } = parsed.reward;
      const row = { ...values, updated_at: new Date().toISOString() };
      const result = id
        ? await auth.admin.from("affiliate_reward_catalog").update(row).eq("id", id).select("id").maybeSingle()
        : await auth.admin.from("affiliate_reward_catalog").insert(row).select("id").single();
      if (result.error) return Response.json({ error: "Não foi possível salvar a recompensa." }, { status: 503 });
      if (!result.data) return Response.json({ error: "Recompensa não encontrada." }, { status: 404 });
      return Response.json({ reward: result.data });
    },
    // Aprova, marca como entregue ou recusa um resgate.
    POST: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const body = await request.json().catch(() => null) as { redemption_id?: unknown; action?: unknown; note?: unknown } | null;
      if (!isUuid(body?.redemption_id)) return Response.json({ error: "Resgate inválido." }, { status: 400 });
      const action = body?.action;
      if (action !== "approve" && action !== "deliver" && action !== "reject") return Response.json({ error: "Ação inválida." }, { status: 400 });
      const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : null;
      const { data, error } = await auth.admin.rpc("review_affiliate_reward", { p_redemption_id: body.redemption_id, p_admin_id: auth.actorId, p_action: action, p_note: note }).single();
      if (error) {
        const known = rewardError(error.message);
        return Response.json({ error: known?.message ?? "Não foi possível atualizar o resgate." }, { status: known?.status ?? 503 });
      }
      return Response.json({ redemption: data });
    },
  } },
});
