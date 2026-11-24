import { describe, expect, it } from "vitest";
import { EFFECTIVE_ORDERS_FILTER, isEffectiveOrder, recoverableOrders, recoveryMessage, whatsappNumber, whatsappRecoveryLink, type RecoverableOrder } from "./orders";

describe("isEffectiveOrder", () => {
  it("ignora pedidos aguardando pagamento sem checkout gerado", () => {
    expect(isEffectiveOrder({ status: "pending_payment" })).toBe(false);
    expect(isEffectiveOrder({ status: "pending_payment", provider_checkout_url: null, payment_link_created_at: null, provider_charge_id: null })).toBe(false);
    expect(isEffectiveOrder({ status: "cancelled" })).toBe(false);
  });

  it("conta pedidos com checkout, link de pagamento ou cobrança", () => {
    expect(isEffectiveOrder({ status: "pending_payment", provider_checkout_url: "https://checkout.example/x" })).toBe(true);
    expect(isEffectiveOrder({ status: "pending_payment", payment_link_created_at: "2026-11-17T10:00:00Z" })).toBe(true);
    expect(isEffectiveOrder({ status: "rejected", provider_charge_id: "ch_1" })).toBe(true);
  });

  it("conta pedidos pagos ou em estorno mesmo sem dados do provedor", () => {
    for (const status of ["paid", "refund_required", "refunded"]) expect(isEffectiveOrder({ status })).toBe(true);
  });
});

describe("EFFECTIVE_ORDERS_FILTER", () => {
  it("usa os mesmos critérios no filtro do banco", () => {
    expect(EFFECTIVE_ORDERS_FILTER).toBe(
      "status.in.(paid,refund_required,refunded),provider_charge_id.not.is.null,provider_checkout_url.not.is.null,payment_link_created_at.not.is.null",
    );
  });
});

describe("recuperação de pagamentos", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const base = { id: "abcdef12-0000-0000-0000-000000000000", total: 2680.13, customer_name: "Maria Souza", customer_phone: "+5585999998888", order_items: [{ name_snapshot: "Halo amaran 200x", qty: 1 }] };
  const order = (overrides: Partial<RecoverableOrder>): RecoverableOrder => ({ ...base, status: "pending_payment", created_at: "2026-11-23T10:00:00Z", provider_checkout_url: "https://checkout.infinitepay.io/x", ...overrides });

  it("lista só pendentes com checkout, entre 30 minutos e 7 dias", () => {
    const list = recoverableOrders([
      order({ id: "1", created_at: "2026-11-23T10:00:00Z" }),
      order({ id: "2", created_at: "2026-11-23T11:50:00Z" }), // 10 min: ainda pagando
      order({ id: "3", created_at: "2026-11-10T10:00:00Z" }), // mais de 7 dias
      order({ id: "4", status: "paid" }),
      order({ id: "5", provider_checkout_url: null, payment_link_created_at: null }), // nunca gerou checkout
    ], now);
    expect(list.map((o) => o.id)).toEqual(["1"]);
  });

  it("normaliza o telefone para o WhatsApp", () => {
    expect(whatsappNumber("+55 (85) 99999-8888")).toBe("5585999998888");
    expect(whatsappNumber("85999998888")).toBe("5585999998888");
    expect(whatsappNumber("123")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it("monta a mensagem com nome, pedido, itens e link de pagamento", () => {
    const message = recoveryMessage(order({}));
    expect(message).toContain("Olá, Maria!");
    expect(message).toContain("#ABCDEF12 (1× Halo amaran 200x)");
    expect(message).toContain("https://checkout.infinitepay.io/x");
    expect(whatsappRecoveryLink(order({}))).toMatch(/^https:[/][/]wa[.]me[/]5585999998888[?]text=/);
  });

  it("oferece novo link quando o pedido não tem link https", () => {
    expect(recoveryMessage(order({ provider_checkout_url: null, payment_link_created_at: "2026-11-23T10:00:00Z" }))).toContain("gerar um novo link");
  });
});
