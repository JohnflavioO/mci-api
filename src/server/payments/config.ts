import { createClient } from "@supabase/supabase-js";
import { createPagarme } from "./pagarme";
import type { OrdersDb } from "./types";

/** Lê secrets só no servidor, dentro do handler. Retorna null se pagamentos não estiverem habilitados. */
export function paymentsConfig() {
  const env = process.env;
  const c = {
    enabled: env["PAYMENTS_ENABLED"] === "true",
    secretKey: env["PAGARME_SECRET_KEY"] ?? "",
    webhookUser: env["PAGARME_WEBHOOK_USER"] ?? "",
    webhookPassword: env["PAGARME_WEBHOOK_PASSWORD"] ?? "",
    supabaseUrl: env["SUPABASE_URL"] ?? "",
    serviceKey: env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  };
  // Trava de segurança: chave de produção nunca é aceita nesta fase.
  if (!c.enabled || !c.secretKey.startsWith("sk_test_") || !c.webhookUser || !c.webhookPassword || !c.supabaseUrl || !c.serviceKey) return null;
  return c;
}

export function buildDeps(c: NonNullable<ReturnType<typeof paymentsConfig>>) {
  const sb = createClient(c.supabaseUrl, c.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw Object.assign(new Error("db"), { code: error.code });
    return data;
  };
  const db: OrdersDb = {
    applyPaymentStatus: async (a) => (await rpc("apply_payment_status", {
      p_order_id: a.orderId, p_provider: a.provider, p_charge_id: a.chargeId, p_status: a.status, p_event_id: a.eventId, p_amount: a.amount,
    })) as string,
    claimRefund: async (lease) => {
      const rows = (await rpc("claim_refund", { p_lease_seconds: lease })) as
        { order_id: string; provider_charge_id: string; refund_idempotency_key: string; attempt: number }[] | null;
      const r = rows?.[0];
      return r ? { orderId: r.order_id, chargeId: r.provider_charge_id, idempotencyKey: r.refund_idempotency_key, attempt: r.attempt } : null;
    },
    recordRefundFailure: async (orderId, error) => { await rpc("record_refund_failure", { p_order_id: orderId, p_error: error }); },
  };
  return { db, provider: createPagarme(c.secretKey) };
}
