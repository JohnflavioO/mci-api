/**
 * Pedido "efetivo": o comprador chegou a gerar o checkout ou já houve pagamento/estorno.
 * Pedidos sem checkout são tentativas abandonadas antes do pagamento e ficam fora das métricas.
 * Mesmo critério do bloqueio de exclusão em /api/admin/orders/$orderId.
 */
export const EFFECTIVE_ORDER_STATUSES = ["paid", "refund_required", "refunded"] as const;

export type OrderPaymentFields = {
  status: string;
  provider_charge_id?: string | null;
  provider_checkout_url?: string | null;
  payment_link_created_at?: string | null;
};

export const isEffectiveOrder = (order: OrderPaymentFields) =>
  (EFFECTIVE_ORDER_STATUSES as readonly string[]).includes(order.status) ||
  Boolean(order.provider_charge_id || order.provider_checkout_url || order.payment_link_created_at);

/** Filtro PostgREST (`.or(...)`) equivalente a `isEffectiveOrder`, para contagens no banco. */
export const EFFECTIVE_ORDERS_FILTER = [
  `status.in.(${EFFECTIVE_ORDER_STATUSES.join(",")})`,
  "provider_charge_id.not.is.null",
  "provider_checkout_url.not.is.null",
  "payment_link_created_at.not.is.null",
].join(",");
