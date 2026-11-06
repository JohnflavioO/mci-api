export const INFINITEPAY_BASE = "https://api.checkout.infinitepay.io";

export type InfinitePayConfig = {
  apiKey: string;
  handle: string;
  appBaseUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
};

type CheckoutItem = { quantity: number; price: number; description: string };
type CheckoutPayload = {
  order_nsu: string;
  items: CheckoutItem[];
  redirect_url: string;
  webhook_url: string;
  customer?: { name: string; email: string; phone_number: string };
  address?: { cep: string; street: string; number: string; neighborhood: string; complement?: string };
  options: {
    single_payment: true;
    require_delivery_address: false;
    payment_methods_enabled: ["credit_card", "pix"];
    valid_until: string;
  };
};

async function requestJson(path: string, apiKey: string, payload: unknown, fetchImpl: typeof fetch = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(`${INFINITEPAY_BASE}${path}`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`infinitepay_http_${response.status}`);
    if (!data || typeof data !== "object") throw new Error("infinitepay_invalid_response");
    return data as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createInfinitePayCheckout(
  config: InfinitePayConfig,
  input: {
    orderId: string;
    items: { name: string; qty: number; unitPrice: number; lineTotal?: number | null }[];
    shippingAmount: number;
    customer?: { name: string; email: string; phone: string };
    address?: { cep: string; street: string; number: string; district: string; city: string; state: string; complement?: string };
  },
  fetchImpl: typeof fetch = fetch,
) {
  const items: CheckoutItem[] = input.items.map((item) => ({
    quantity: 1,
    price: Math.round((item.lineTotal ?? item.unitPrice * item.qty) * 100),
    description: (item.qty > 1 ? `${item.name} · ${item.qty} un.` : item.name).slice(0, 120),
  }));
  if (input.shippingAmount > 0) {
    items.push({ quantity: 1, price: Math.round(input.shippingAmount * 100), description: "Frete" });
  }
  if (!items.length || items.some((i) => !Number.isInteger(i.price) || i.price <= 0 || !Number.isInteger(i.quantity) || i.quantity < 1)) {
    throw new Error("infinitepay_invalid_order_items");
  }
  const payload: CheckoutPayload = {
    order_nsu: input.orderId,
    items,
    redirect_url: `${config.appBaseUrl}/pagamento-retorno`,
    webhook_url: `${config.appBaseUrl}/api/public/infinitepay-webhook`,
    options: {
      single_payment: true,
      require_delivery_address: false,
      payment_methods_enabled: ["credit_card", "pix"],
      valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  };
  if (input.customer?.name && input.customer.email && input.customer.phone) {
    payload.customer = { name: input.customer.name, email: input.customer.email, phone_number: input.customer.phone };
  }
  if (input.address?.cep && input.address.street && input.address.number && input.address.district) {
    payload.address = {
      cep: input.address.cep.replace(/\D/g, ""),
      street: input.address.street,
      number: input.address.number,
      neighborhood: input.address.district,
      ...(input.address.complement ? { complement: input.address.complement } : {}),
    };
  }
  const response = await requestJson("/links", config.apiKey, payload, fetchImpl);
  const checkoutUrl = [response["url"], response["checkout_url"], response["payment_url"]]
    .find((v): v is string => typeof v === "string" && /^https:\/\//i.test(v));
  if (!checkoutUrl) throw new Error("infinitepay_checkout_url_missing");
  return checkoutUrl;
}

export type InfinitePayVerifiedPayment = {
  orderNsu: string;
  transactionNsu: string;
  invoiceSlug: string;
  amount: number;
  paidAmount: number;
  installments: number;
  captureMethod: "pix" | "credit_card" | null;
  paid: boolean;
};

export async function verifyInfinitePayPayment(
  config: InfinitePayConfig,
  input: { orderNsu: string; transactionNsu: string; invoiceSlug: string },
  fetchImpl: typeof fetch = fetch,
): Promise<InfinitePayVerifiedPayment> {
  const response = await requestJson("/payment_check", config.apiKey, {
    handle: config.handle,
    order_nsu: input.orderNsu,
    transaction_nsu: input.transactionNsu,
    slug: input.invoiceSlug,
  }, fetchImpl);
  const capture = response["capture_method"];
  return {
    orderNsu: input.orderNsu,
    transactionNsu: input.transactionNsu,
    invoiceSlug: input.invoiceSlug,
    amount: Number(response["amount"] ?? 0),
    paidAmount: Number(response["paid_amount"] ?? 0),
    installments: Number(response["installments"] ?? 0),
    captureMethod: capture === "pix" || capture === "credit_card" ? capture : null,
    paid: response["success"] === true && response["paid"] === true,
  };
}
