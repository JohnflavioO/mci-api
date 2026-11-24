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
  const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida." }, { status: 401 }) } as const;
  const { data: isAdmin, error: roleError } = await user.rpc("has_role", { _role: "admin" });
  if (roleError || isAdmin !== true) return { response: Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) } as const;
  return { admin: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
}

// Relatório de comissões: uma linha por comissão, com afiliado, pedido, base, %, valor e situação.
// ?days=30|90|365 limita pela data de pagamento do pedido; sem o parâmetro (ou "all"), traz tudo (até 2.000).
export const Route = createFileRoute("/api/admin/affiliate-commissions")({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      // Libera as comissões vencidas para a situação ficar atual.
      await auth.admin.rpc("release_affiliate_commissions");
      const days = Number(new URL(request.url).searchParams.get("days"));
      let query = auth.admin.from("affiliate_commissions")
        .select("id,affiliate_user_id,order_id,order_total,commission_rate,commission_amount,status,created_at,available_at,paid_at,payment_reference,payout_id,reversed_at,reversal_reason,affiliate_profiles(display_name,referral_code),affiliate_payouts(status)")
        .order("created_at", { ascending: false })
        .limit(2000);
      if ([30, 90, 365].includes(days)) query = query.gte("created_at", new Date(Date.now() - days * 86400000).toISOString());
      const [commissions, settings] = await Promise.all([
        query,
        auth.admin.from("affiliate_settings").select("grace_days").eq("id", true).single(),
      ]);
      if (commissions.error || settings.error) return Response.json({ error: "Não foi possível carregar o relatório de comissões." }, { status: 503 });
      return Response.json({ commissions: commissions.data ?? [], graceDays: Number(settings.data.grace_days ?? 7) });
    },
  } },
});
