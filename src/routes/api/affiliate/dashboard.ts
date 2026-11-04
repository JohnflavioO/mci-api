import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function serverConfig() {
  return {
    url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "",
    publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "",
    serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  };
}

export const Route = createFileRoute("/api/affiliate/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const config = serverConfig();
        if (!config.url || !config.publishableKey || !config.serviceRoleKey) {
          return Response.json({ error: "O portal de afiliados não está configurado no servidor." }, { status: 503 });
        }
        if (!token) return Response.json({ error: "Entre na sua conta para acessar o portal." }, { status: 401 });

        const userClient = createClient(config.url, config.publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: auth, error: authError } = await userClient.auth.getUser(token);
        if (authError || !auth.user) return Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
        const { data: isAffiliate, error: roleError } = await userClient.rpc("has_role", { _role: "afiliado" });
        if (roleError || isAffiliate !== true) return Response.json({ error: "Esta conta não possui acesso ao portal de afiliados." }, { status: 403 });

        const admin = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const [profileResult, clicksResult, commissionsResult, ledgerResult] = await Promise.all([
          admin.from("affiliate_profiles").select("user_id,referral_code,commission_rate,status,display_name,created_at").eq("user_id", auth.user.id).maybeSingle(),
          admin.from("affiliate_referral_clicks").select("id", { count: "exact", head: true }).eq("affiliate_user_id", auth.user.id),
          admin.from("affiliate_commissions").select("id,order_id,order_total,commission_rate,commission_amount,status,created_at,paid_at").eq("affiliate_user_id", auth.user.id).order("created_at", { ascending: false }).limit(100),
          admin.from("affiliate_points_ledger").select("points_type,points_delta").eq("affiliate_user_id", auth.user.id).limit(5000),
        ]);
        const failure = [profileResult, clicksResult, commissionsResult, ledgerResult].find((item) => item.error);
        if (failure?.error) return Response.json({ error: "Não foi possível carregar os dados do afiliado. Verifique se as migrações do programa foram aplicadas." }, { status: 503 });
        if (!profileResult.data) return Response.json({ error: "Seu cadastro foi identificado, mas o perfil de afiliado ainda não foi provisionado. Solicite a sincronização ao administrador." }, { status: 409 });

        const commissions = commissionsResult.data ?? [];
        const points = (ledgerResult.data ?? []).reduce((balance, row) => {
          if (row.points_type === "performance") balance.performance += row.points_delta;
          if (row.points_type === "reward") balance.reward += row.points_delta;
          return balance;
        }, { performance: 0, reward: 0 });
        const commissionTotals = commissions.reduce((totals, row) => {
          const amount = Number(row.commission_amount);
          totals.total += amount;
          if (row.status === "pending") totals.pending += amount;
          if (row.status === "approved" || row.status === "available") totals.available += amount;
          if (row.status === "paid") totals.paid += amount;
          return totals;
        }, { total: 0, pending: 0, available: 0, paid: 0 });

        return Response.json({
          profile: profileResult.data,
          metrics: { clicks: clicksResult.count ?? 0, commissions: commissions.length, commissionTotals, points },
          commissions: commissions.slice(0, 10),
        });
      },
    },
  },
});
