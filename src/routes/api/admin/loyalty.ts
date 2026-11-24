import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { loyaltyError, parseLoyaltySettings } from "@/lib/loyalty";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["earn", "redeem", "redeem_refund", "reversal", "expire", "adjust"];

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

const LEDGER_FIELDS = "id,user_id,kind,points,order_id,description,available_at,expires_at,remaining,created_by,created_at";

// GET                              -> regras e números do programa
// GET ?view=customers              -> clientes com pontos (saldo, ganhos, usados, vencidos, ajustes)
// GET ?view=customer&user_id=...   -> extrato completo de um cliente
// GET ?view=transactions[&kind=][&days=] -> todas as movimentações (até 1.000)
// PUT                              -> salva as regras
// POST { user_id, points, reason } -> ajuste manual (crédito ou débito), auditado
export const Route = createFileRoute("/api/admin/loyalty")({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const params = new URL(request.url).searchParams;
      const view = params.get("view");

      if (view === "customers") {
        const { data, error } = await auth.admin.rpc("loyalty_customers_summary");
        if (error) return Response.json({ error: "Não foi possível listar os clientes. Confira se o SQL de controle do programa foi aplicado." }, { status: 503 });
        return Response.json({ customers: data ?? [] });
      }

      if (view === "customer") {
        const userId = params.get("user_id") ?? "";
        if (!UUID.test(userId)) return Response.json({ error: "Cliente inválido." }, { status: 400 });
        await auth.admin.rpc("loyalty_expire_points", { p_user_id: userId });
        const [ledger, balance] = await Promise.all([
          auth.admin.from("loyalty_points_ledger").select(LEDGER_FIELDS).eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
          auth.admin.rpc("loyalty_balance", { p_user_id: userId }).single(),
        ]);
        if (ledger.error || balance.error) return Response.json({ error: "Não foi possível carregar o extrato." }, { status: 503 });
        return Response.json({ ledger: ledger.data ?? [], balance: balance.data });
      }

      if (view === "transactions") {
        const kind = params.get("kind");
        const days = Number(params.get("days"));
        let q = auth.admin.from("loyalty_points_ledger").select(LEDGER_FIELDS).order("created_at", { ascending: false }).limit(1000);
        if (kind && KINDS.includes(kind)) q = q.eq("kind", kind);
        if ([7, 30, 90, 365].includes(days)) q = q.gte("created_at", new Date(Date.now() - days * 86400000).toISOString());
        const [ledger, customers] = await Promise.all([q, auth.admin.rpc("loyalty_customers_summary")]);
        if (ledger.error || customers.error) return Response.json({ error: "Não foi possível carregar as movimentações." }, { status: 503 });
        const names = new Map((customers.data as { user_id: string; email: string; full_name: string | null }[] ?? []).map((c) => [c.user_id, c.full_name || c.email]));
        return Response.json({ transactions: (ledger.data ?? []).map((t) => ({ ...t, customer: names.get(t.user_id) ?? t.user_id.slice(0, 8), by_admin: t.created_by ? names.get(t.created_by) ?? "Admin" : null })) });
      }

      const [settings, stats] = await Promise.all([
        auth.admin.from("loyalty_settings").select("*").eq("id", true).single(),
        auth.admin.rpc("loyalty_program_stats").single(),
      ]);
      if (settings.error || stats.error) return Response.json({ error: "Não foi possível carregar o Store House Pontos. Confira se o SQL do programa foi aplicado." }, { status: 503 });
      return Response.json({ settings: settings.data, stats: stats.data });
    },
    PUT: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const parsed = parseLoyaltySettings(await request.json().catch(() => null));
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
      const { data, error } = await auth.admin.from("loyalty_settings")
        .update({ ...parsed.settings, updated_by: auth.actorId, updated_at: new Date().toISOString() })
        .eq("id", true).select("*").single();
      if (error) return Response.json({ error: "Não foi possível salvar as regras." }, { status: 503 });
      return Response.json({ settings: data });
    },
    POST: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const body = await request.json().catch(() => null) as { user_id?: unknown; points?: unknown; reason?: unknown } | null;
      const userId = typeof body?.user_id === "string" ? body.user_id : "";
      const points = Number(body?.points);
      if (!UUID.test(userId)) return Response.json({ error: "Cliente inválido." }, { status: 400 });
      if (!Number.isInteger(points) || points === 0) return Response.json({ error: "Informe uma quantidade inteira de pontos, diferente de zero." }, { status: 400 });
      const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
      const { data, error } = await auth.admin.rpc("admin_adjust_loyalty_points", { p_user_id: userId, p_points: points, p_reason: reason, p_admin_id: auth.actorId }).single();
      if (error) {
        const known = loyaltyError(error.message);
        return Response.json({ error: known?.message ?? "Não foi possível registrar o ajuste." }, { status: known?.status ?? 503 });
      }
      return Response.json({ entry: data });
    },
  } },
});
