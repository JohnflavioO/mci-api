import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function config() {
  return { url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "", publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "", serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" };
}

const PUBLIC_SETTINGS = "enabled,points_per_real,real_per_100_points,max_redeem_pct,min_redeem_points,grace_days,expiry_months";

// GET /api/loyalty          -> regras públicas do programa (para o selo "Ganhe X pontos"), sem login
// GET /api/loyalty (logado)  -> + saldo, extrato e, com ?subtotal=, quantos pontos dá para usar no checkout
export const Route = createFileRoute("/api/loyalty")({
  server: { handlers: {
    GET: async ({ request }) => {
      const c = config();
      if (!c.url || !c.publishableKey || !c.serviceRoleKey) return Response.json({ error: "Programa de pontos não configurado no servidor." }, { status: 503 });
      const db = createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const settings = await db.from("loyalty_settings").select(PUBLIC_SETTINGS).eq("id", true).maybeSingle();
      if (settings.error) return Response.json({ error: "Programa de pontos indisponível." }, { status: 503 });

      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!token) return Response.json({ settings: settings.data, signedIn: false });
      const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: auth, error } = await user.auth.getUser(token);
      if (error || !auth.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });

      const subtotal = Number(new URL(request.url).searchParams.get("subtotal") ?? "0");
      const [balance, ledger, quote] = await Promise.all([
        db.rpc("loyalty_balance", { p_user_id: auth.user.id }).single(),
        db.from("loyalty_points_ledger").select("id,kind,points,description,created_at,available_at,expires_at,remaining").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(50),
        db.rpc("loyalty_max_redeem", { p_user_id: auth.user.id, p_products_total: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0 }).single(),
      ]);
      if (balance.error || ledger.error || quote.error) return Response.json({ error: "Não foi possível carregar seus pontos." }, { status: 503 });
      const b = balance.data as { available: number; pending: number; expiring_30d: number; next_expiry: string | null };
      const qd = quote.data as { max_points: number; max_discount: number; eligible: boolean };
      return Response.json({
        settings: settings.data,
        signedIn: true,
        eligible: qd.eligible,
        balance: { available: Number(b.available ?? 0), pending: Number(b.pending ?? 0), expiring30d: Number(b.expiring_30d ?? 0), nextExpiry: b.next_expiry },
        redeem: { maxPoints: Number(qd.max_points ?? 0), maxDiscount: Number(qd.max_discount ?? 0) },
        ledger: ledger.data ?? [],
      });
    },
  } },
});
