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

/* ---------- Recuperação de pagamentos pendentes ---------- */

export type RecoverableOrder = OrderPaymentFields & {
  id: string;
  created_at: string;
  total: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  order_items?: { name_snapshot: string; qty: number }[] | null;
};

/** Janela em que vale lembrar o cliente: depois de 30 min (tempo de pagar) e até 7 dias. */
export const RECOVERY_MIN_AGE_MINUTES = 30;
export const RECOVERY_MAX_AGE_DAYS = 7;

/** Pedidos que geraram checkout, seguem aguardando pagamento e estão na janela de recuperação. */
export function recoverableOrders<T extends RecoverableOrder>(orders: T[], now = new Date()): T[] {
  const nowMs = now.getTime();
  return orders
    .filter((order) => {
      if (order.status !== "pending_payment" || !isEffectiveOrder(order)) return false;
      const ageMs = nowMs - new Date(order.created_at).getTime();
      return ageMs >= RECOVERY_MIN_AGE_MINUTES * 60_000 && ageMs <= RECOVERY_MAX_AGE_DAYS * 86_400_000;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** Telefone em formato internacional só com dígitos (wa.me). Números sem DDI recebem 55. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  return null;
}

const isHttpsUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

/** Mensagem de lembrete; o atendente revisa antes de enviar pelo WhatsApp. */
export function recoveryMessage(order: RecoverableOrder, storeName = "Store House") {
  const NL = String.fromCharCode(10);
  const firstName = (order.customer_name ?? "").trim().split(" ")[0];
  const items = (order.order_items ?? []).map((item) => `${item.qty}× ${item.name_snapshot}`).join(", ");
  const total = Number(order.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return [
    `Olá${firstName ? ", " + firstName : ""}! Aqui é da ${storeName}.`,
    `Vimos que o seu pedido #${order.id.slice(0, 8).toUpperCase()}${items ? ` (${items})` : ""}, no valor de ${total}, ficou aguardando pagamento.`,
    isHttpsUrl(order.provider_checkout_url) ? `Se quiser concluir, é só usar este link: ${order.provider_checkout_url}` : "Se quiser concluir, podemos gerar um novo link de pagamento para você.",
    "Ficou alguma dúvida sobre o produto, o frete ou a forma de pagamento? É só responder por aqui.",
  ].join(NL + NL);
}

export function whatsappRecoveryLink(order: RecoverableOrder, storeName?: string): string | null {
  const number = whatsappNumber(order.customer_phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(recoveryMessage(order, storeName))}` : null;
}
