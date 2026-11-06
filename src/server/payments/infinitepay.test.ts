import { describe, expect, it, vi } from "vitest";
import { createInfinitePayCheckout, verifyInfinitePayPayment, type InfinitePayConfig } from "./infinitepay";

const config: InfinitePayConfig = {
  apiKey: "inchk_test_secret",
  handle: "storehouse",
  appBaseUrl: "https://storehouse.example",
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "server-only",
};

describe("InfinitePay Checkout Integrado", () => {
  it("envia payload documentado, valores em centavos e webhook_url", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ url: "https://checkout.infinitepay.io/pay/abc" }), { status: 200 }),
    );
    const url = await createInfinitePayCheckout(config, {
      orderId: "11111111-1111-1111-1111-111111111111",
      items: [{ name: "Luminária Amaran", qty: 2, unitPrice: 100, lineTotal: 180 }],
      shippingAmount: 20,
      customer: { name: "Cliente", email: "cliente@example.com", phone: "+5511999999999" },
      address: { cep: "01001000", street: "Praça da Sé", number: "1", district: "Sé", city: "São Paulo", state: "SP" },
    }, fetcher as unknown as typeof fetch);
    expect(url).toBe("https://checkout.infinitepay.io/pay/abc");
    const [requestUrl, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestUrl).toBe("https://api.checkout.infinitepay.io/links");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("inchk_test_secret");
    const payload = JSON.parse(String(init.body)) as {
      order_nsu: string; items: { quantity: number; price: number; description: string }[];
      redirect_url: string; webhook_url: string;
      customer: { name: string; email: string; phone_number: string };
      address: { cep: string; street: string; number: string; neighborhood: string; city: string; state: string; complement?: string };
      options: { single_payment: boolean; payment_methods_enabled: string[] };
      webhook?: unknown;
    };
    expect(payload.order_nsu).toBe("11111111-1111-1111-1111-111111111111");
    expect(payload.items).toEqual([
      { quantity: 1, price: 18000, description: "Luminária Amaran · 2 un." },
      { quantity: 1, price: 2000, description: "Frete" },
    ]);
    expect(payload.redirect_url).toBe("https://storehouse.example/pagamento-retorno");
    expect(payload.webhook_url).toBe("https://storehouse.example/api/public/infinitepay-webhook");
    expect(payload.webhook).toBeUndefined();
    expect(payload.customer.phone_number).toBe("+5511999999999");
    expect(payload.address).toMatchObject({ cep: "01001000", street: "Praça da Sé", number: "1", neighborhood: "Sé", city: "São Paulo", state: "SP" });
    expect(payload.options.single_payment).toBe(true);
    expect(payload.options.payment_methods_enabled).toEqual(["credit_card", "pix"]);
  });

  it("considera pago somente quando a consulta oficial retorna success e paid verdadeiros", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      success: true, paid: true, amount: 20000, paid_amount: 20400, installments: 2, capture_method: "credit_card",
    }), { status: 200 }));
    const result = await verifyInfinitePayPayment(config, {
      orderNsu: "11111111-1111-1111-1111-111111111111", transactionNsu: "transaction-123", invoiceSlug: "invoice-123",
    }, fetcher as unknown as typeof fetch);
    expect(result.paid).toBe(true);
    expect(result.amount).toBe(20000);
    expect(result.paidAmount).toBe(20400);
    expect(result.captureMethod).toBe("credit_card");
    const [requestUrl, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestUrl).toBe("https://api.checkout.infinitepay.io/payment_check");
    expect(JSON.parse(String(init.body))).toEqual({
      handle: "storehouse", order_nsu: "11111111-1111-1111-1111-111111111111",
      transaction_nsu: "transaction-123", slug: "invoice-123",
    });
  });

  it("não aprova retorno quando payment_check diz que ainda não foi pago", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, paid: false, amount: 10000 }), { status: 200 }));
    const result = await verifyInfinitePayPayment(config, {
      orderNsu: "11111111-1111-1111-1111-111111111111", transactionNsu: "transaction-123", invoiceSlug: "invoice-123",
    }, fetcher as unknown as typeof fetch);
    expect(result.paid).toBe(false);
  });
});
