import { createClient } from "@supabase/supabase-js";
import type { InfinitePayConfig } from "./infinitepay";
import { verifyInfinitePayPayment } from "./infinitepay";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reconcileInfinitePayPayment(
  config: InfinitePayConfig,
  input: { orderNsu: string; transactionNsu: string; invoiceSlug: string; receiptUrl?: string | null },
) {
  if (!UUID.test(input.orderNsu) || input.transactionNsu.length < 8 || input.transactionNsu.length > 200 || input.invoiceSlug.length < 1 || input.invoiceSlug.length > 200) {
    return { http: 400, outcome: "invalid_payment_reference" };
  }
  const db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: order, error: orderError } = await db.from("orders")
    .select("id,total,status,provider,provider_checkout_url")
    .eq("id", input.orderNsu).eq("provider", "infinitepay").maybeSingle();
  if (orderError) return { http: 503, outcome: "order_lookup_failed" };
  if (!order) return { http: 200, outcome: "unknown_order" };
  if (order.status === "paid") return { http: 200, outcome: "already_paid" };
  if (order.status !== "pending_payment" && order.status !== "cancelled" && order.status !== "rejected") return { http: 200, outcome: "order_not_payable" };

  let verified;
  try {
    verified = await verifyInfinitePayPayment(config, {
      orderNsu: input.orderNsu, transactionNsu: input.transactionNsu, invoiceSlug: input.invoiceSlug,
    });
  } catch {
    return { http: 502, outcome: "infinitepay_verification_unavailable" };
  }
  if (!verified.paid) return { http: 200, outcome: "payment_not_confirmed" };
  const amount = Math.round(verified.amount) / 100;
  if (!Number.isFinite(amount) || Math.abs(amount - Number(order.total)) > 0.009) {
    return { http: 200, outcome: "amount_mismatch" };
  }

  const { error: metadataError } = await db.from("orders").update({
    provider_invoice_slug: input.invoiceSlug,
    provider_transaction_nsu: input.transactionNsu,
    provider_capture_method: verified.captureMethod,
    provider_receipt_url: input.receiptUrl && /^https:\/\//i.test(input.receiptUrl) ? input.receiptUrl : null,
  }).eq("id", order.id).in("status", ["pending_payment", "cancelled", "rejected"]);
  if (metadataError) return { http: 503, outcome: "payment_metadata_save_failed" };

  const { data, error } = await db.rpc("apply_payment_status", {
    p_order_id: order.id,
    p_provider: "infinitepay",
    p_charge_id: input.transactionNsu,
    p_status: "paid",
    p_event_id: `infinitepay:${input.transactionNsu}:paid`,
    p_amount: amount,
  });
  if (error) {
    if (error.code === "23514" || error.code === "P0002" || error.code === "22023") return { http: 200, outcome: "payment_rejected_by_order_rules" };
    return { http: 503, outcome: "payment_status_update_failed" };
  }
  return { http: 200, outcome: String(data ?? "processed") };
}
