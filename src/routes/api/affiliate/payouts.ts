import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { normalizePixKey, payoutError } from "@/lib/pixKey";

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

type Db = Extract<Awaited<ReturnType<typeof authorize>>, { db: unknown }>["db"];

async function snapshot(db: Db, userId: string) {
  // Libera comissões vencidas antes de mostrar o saldo (não há agendador no banco).
  await db.rpc("release_affiliate_commissions");
  const [balance, profile, settings, payouts, adjustments] = await Promise.all([
    db.rpc("affiliate_balance", { p_user_id: userId }).single(),
    db.from("affiliate_profiles").select("payout_pix_key,status").eq("user_id", userId).maybeSingle(),
    db.from("affiliate_settings").select("min_withdrawal,grace_days").eq("id", true).single(),
    db.from("affiliate_payouts").select("id,amount,pix_key,status,requested_at,reviewed_at,payment_reference,rejection_reason").eq("affiliate_user_id", userId).order("requested_at", { ascending: false }).limit(50),
    db.from("affiliate_balance_adjustments").select("id,amount,reason,created_at,payout_id").eq("affiliate_user_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (balance.error || profile.error || settings.error || payouts.error || adjustments.error) return null;
  const b = balance.data as Record<string, number | string>;
  return {
    balance: {
      withdrawable: Number(b["withdrawable"] ?? 0), available: Number(b["available"] ?? 0), adjustments: Number(b["adjustments"] ?? 0),
      pending: Number(b["pending"] ?? 0), inPayout: Number(b["in_payout"] ?? 0), paid: Number(b["paid"] ?? 0),
    },
    pixKey: profile.data?.payout_pix_key ?? null,
    status: profile.data?.status ?? null,
    minWithdrawal: Number(settings.data.min_withdrawal),
    graceDays: Number(settings.data.grace_days),
    payouts: payouts.data ?? [],
    adjustments: adjustments.data ?? [],
  };
}

export const Route = createFileRoute("/api/affiliate/payouts")({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const data = await snapshot(auth.db, auth.userId);
      if (!data) return Response.json({ error: "Não foi possível carregar seu saldo." }, { status: 503 });
      return Response.json(data);
    },
    // Cadastra ou troca a chave Pix. Saques já pedidos mantêm a chave da época do pedido.
    PATCH: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const body = await request.json().catch(() => null) as { pix_key?: unknown } | null;
      const pix = normalizePixKey(body?.pix_key);
      if (!pix.ok) return Response.json({ error: pix.error }, { status: 400 });
      const { data, error } = await auth.db.from("affiliate_profiles")
        .update({ payout_pix_key: pix.key, updated_at: new Date().toISOString() })
        .eq("user_id", auth.userId).select("payout_pix_key").maybeSingle();
      if (error) return Response.json({ error: "Não foi possível salvar a chave Pix." }, { status: 503 });
      if (!data) return Response.json({ error: "Cadastro de afiliado não encontrado." }, { status: 404 });
      return Response.json({ pixKey: data.payout_pix_key, type: pix.type });
    },
    // Pede o saque de todo o saldo disponível.
    POST: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const { data, error } = await auth.db.rpc("request_affiliate_payout", { p_user_id: auth.userId }).single();
      if (error) {
        const known = payoutError(error.message) ?? (error.code === "23505" ? payoutError("AFF_OPEN_PAYOUT") : null);
        return Response.json({ error: known?.message ?? "Não foi possível registrar o pedido de saque." }, { status: known?.status ?? 503 });
      }
      return Response.json({ payout: data });
    },
  } },
});
