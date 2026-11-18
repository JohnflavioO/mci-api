import { describe, expect, it } from "vitest";
import { EFFECTIVE_ORDERS_FILTER, isEffectiveOrder } from "./orders";

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
