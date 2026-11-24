import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { payoutError } from "@/lib/pixKey";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export const Route = createFileRoute("/api/admin/affiliate-payouts")({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      await auth.admin.rpc("release_affiliate_commissions");
      const [payouts, commissions] = await Promise.all([
        auth.admin.from("affiliate_payouts")
          .select("id,affiliate_user_id,amount,pix_key,status,requested_at,reviewed_at,payment_reference,rejection_reason,affiliate_profiles(display_name)")
          .order("requested_at", { ascending: false }).limit(300),
        auth.admin.from("affiliate_commissions").select("status,commission_amount,payout_id").in("status", ["pending", "available"]).limit(10000),
      ]);
      if (payouts.error || commissions.error) return Response.json({ error: "Não foi possível carregar os saques." }, { status: 503 });
      // E-mail de quem pediu saque em aberto, para o admin conferir a titularidade da chave.
      const open = (payouts.data ?? []).filter((p) => p.status === "requested");
      const emails = new Map<string, string>();
      await Promise.all([...new Set(open.map((p) => p.affiliate_user_id))].map(async (id) => {
        const { data } = await auth.admin.auth.admin.getUserById(id);
        if (data.user?.email) emails.set(id, data.user.email);
      }));
      const sum = (rows: { commission_amount: number | string }[]) => rows.reduce((s, r) => s + Number(r.commission_amount), 0);
      const rows = commissions.data ?? [];
      return Response.json({
        payouts: (payouts.data ?? []).map((p) => ({ ...p, email: emails.get(p.affiliate_user_id) ?? null })),
        totals: {
          requested: open.reduce((s, p) => s + Number(p.amount), 0),
          requestedCount: open.length,
          pending: sum(rows.filter((r) => r.status === "pending")),
          available: sum(rows.filter((r) => r.status === "available" && !r.payout_id)),
        },
      });
    },
    POST: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const body = await request.json().catch(() => null) as { action?: unknown; payout_id?: unknown; reference?: unknown; reason?: unknown } | null;
      const payoutId = typeof body?.payout_id === "string" ? body.payout_id : "";
      if (!UUID.test(payoutId)) return Response.json({ error: "Saque inválido." }, { status: 400 });
      const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
      const result = body?.action === "pay"
        ? await auth.admin.rpc("mark_affiliate_payout_paid", { p_payout_id: payoutId, p_admin_id: auth.actorId, p_reference: text(body?.reference, 200) }).single()
        : body?.action === "reject"
          ? await auth.admin.rpc("reject_affiliate_payout", { p_payout_id: payoutId, p_admin_id: auth.actorId, p_reason: text(body?.reason, 500) }).single()
          : null;
      if (!result) return Response.json({ error: "Ação inválida." }, { status: 400 });
      if (result.error) {
        const known = payoutError(result.error.message);
        return Response.json({ error: known?.message ?? "Não foi possível atualizar o saque." }, { status: known?.status ?? 503 });
      }
      return Response.json({ payout: result.data });
    },
  } },
});
