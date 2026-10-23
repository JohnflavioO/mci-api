import type { OrdersDb, PaymentProvider } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WebhookResult = { http: number; outcome: string };

/**
 * Processa uma notificação: o corpo só fornece IDs; o estado vem da consulta ao provedor.
 * Repetições e eventos fora de ordem são tratados pela função do banco (idempotente).
 * Erro temporário => 5xx para o provedor reenviar.
 */
export async function handlePaymentWebhook(body: unknown, provider: PaymentProvider, db: OrdersDb): Promise<WebhookResult> {
  const ev = body as { id?: unknown; data?: { id?: unknown } } | null;
  const eventId = typeof ev?.id === "string" ? ev.id : null;
  const chargeId = typeof ev?.data?.id === "string" ? ev.data.id : null;
  if (!eventId || !chargeId || !chargeId.startsWith("ch_")) return { http: 200, outcome: "ignored" };

  let charge;
  try { charge = await provider.getCharge(chargeId); } catch { return { http: 502, outcome: "provider_unavailable" }; }
  if (!charge.status) return { http: 200, outcome: "status_needs_review" };
  if (!charge.orderId || !UUID.test(charge.orderId)) return { http: 200, outcome: "unknown_order" };

  try {
    const status = await db.applyPaymentStatus({
      orderId: charge.orderId, provider: provider.name, chargeId: charge.chargeId,
      status: charge.status, eventId: `${eventId}:${charge.status}`, amount: charge.amount,
    });
    return { http: 200, outcome: status };
  } catch (e) {
    const code = (e as { code?: string }).code;
    // Regras de negócio (valor divergente, cobrança de outro pedido, pedido inexistente): não adianta reenviar.
    if (code === "23514" || code === "P0002" || code === "22023") return { http: 200, outcome: `rejected_${code}` };
    return { http: 500, outcome: "db_error" };
  }
}

/** Processa estornos pendentes. Só pede o estorno; a confirmação chega por webhook/consulta. */
export async function processRefunds(provider: PaymentProvider, db: OrdersDb, max = 10) {
  const results: { orderId: string; ok: boolean }[] = [];
  for (let i = 0; i < max; i++) {
    const job = await db.claimRefund(120);
    if (!job) break;
    try {
      await provider.requestRefund(job.chargeId, job.idempotencyKey);
      results.push({ orderId: job.orderId, ok: true });
    } catch (e) {
      await db.recordRefundFailure(job.orderId, e instanceof Error ? e.message : "erro");
      results.push({ orderId: job.orderId, ok: false });
    }
  }
  return results;
}
