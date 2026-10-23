import { describe, expect, it, vi } from "vitest";
import { createPagarme, normalizeChargeStatus, verifyBasicAuth } from "./pagarme";
import { handlePaymentWebhook, processRefunds } from "./core";
import type { ChargeSnapshot, OrdersDb, PaymentProvider } from "./types";

const ORDER = "11111111-1111-1111-1111-111111111111";
const provider = (snap: Partial<ChargeSnapshot> | Error): PaymentProvider => ({
  name: "pagarme",
  getCharge: vi.fn(async (): Promise<ChargeSnapshot> => { if (snap instanceof Error) throw snap; return { chargeId: "ch_1", orderId: ORDER, status: "paid", amount: 30, ...snap }; }),
  requestRefund: vi.fn(async () => undefined),
});
const db = (over: Partial<OrdersDb> = {}): OrdersDb => ({
  applyPaymentStatus: vi.fn(async () => "paid"), claimRefund: vi.fn(async () => null), recordRefundFailure: vi.fn(async () => undefined), ...over,
});

describe("status do Pagar.me", () => {
  it("mapeia status reais e não aprova status ambíguos", () => {
    expect(normalizeChargeStatus("paid")).toBe("paid");
    expect(normalizeChargeStatus("pending")).toBe("pending");
    expect(normalizeChargeStatus("failed")).toBe("failed");
    expect(normalizeChargeStatus("chargedback")).toBe("chargedback");
    expect(normalizeChargeStatus("overpaid")).toBeNull();
    expect(normalizeChargeStatus("underpaid")).toBeNull();
  });
});

describe("autenticação do webhook", () => {
  const h = (s: string) => `Basic ${btoa(s)}`;
  it("aceita só usuário e senha exatos", () => {
    expect(verifyBasicAuth(h("u:p"), "u", "p")).toBe(true);
    expect(verifyBasicAuth(h("u:x"), "u", "p")).toBe(false);
    expect(verifyBasicAuth(null, "u", "p")).toBe(false);
    expect(verifyBasicAuth(h(":"), "", "")).toBe(false);
  });
});

describe("webhook", () => {
  it("usa o status consultado no provedor, não o do corpo", async () => {
    const p = provider({ status: "failed" }); const d = db();
    await handlePaymentWebhook({ id: "hook_1", type: "charge.paid", data: { id: "ch_1", status: "paid" } }, p, d);
    expect(d.applyPaymentStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", orderId: ORDER, amount: 30 }));
  });
  it("Pix pendente é registrado como pendente", async () => {
    const d = db();
    await handlePaymentWebhook({ id: "h", data: { id: "ch_1" } }, provider({ status: "pending" }), d);
    expect(d.applyPaymentStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
  });
  it("falha de rede no provedor pede reenvio (5xx) e não grava nada", async () => {
    const d = db();
    const r = await handlePaymentWebhook({ id: "h", data: { id: "ch_1" } }, provider(new Error("timeout")), d);
    expect(r.http).toBe(502); expect(d.applyPaymentStatus).not.toHaveBeenCalled();
  });
  it("status ambíguo não altera o pedido", async () => {
    const d = db();
    const r = await handlePaymentWebhook({ id: "h", data: { id: "ch_1" } }, provider({ status: null }), d);
    expect(r.outcome).toBe("status_needs_review"); expect(d.applyPaymentStatus).not.toHaveBeenCalled();
  });
  it("valor divergente é rejeitado sem pedir reenvio", async () => {
    const d = db({ applyPaymentStatus: vi.fn(async () => { throw Object.assign(new Error(), { code: "23514" }); }) });
    expect((await handlePaymentWebhook({ id: "h", data: { id: "ch_1" } }, provider({}), d)).http).toBe(200);
  });
  it("erro do banco pede reenvio", async () => {
    const d = db({ applyPaymentStatus: vi.fn(async () => { throw Object.assign(new Error(), { code: "08006" }); }) });
    expect((await handlePaymentWebhook({ id: "h", data: { id: "ch_1" } }, provider({}), d)).http).toBe(500);
  });
  it("ignora corpo sem IDs ou pedido desconhecido", async () => {
    const d = db();
    expect((await handlePaymentWebhook({}, provider({}), d)).outcome).toBe("ignored");
    expect((await handlePaymentWebhook({ id: "h", data: { id: "ch_1" } }, provider({ orderId: "x" }), d)).outcome).toBe("unknown_order");
    expect(d.applyPaymentStatus).not.toHaveBeenCalled();
  });
});

describe("estornos", () => {
  it("falha mantém pendente; sucesso não marca reembolsado", async () => {
    const jobs = [{ orderId: "o1", chargeId: "ch_1", idempotencyKey: "k1", attempt: 1 }, { orderId: "o2", chargeId: "ch_2", idempotencyKey: "k2", attempt: 1 }];
    const d = db({ claimRefund: vi.fn(async () => jobs.shift() ?? null) });
    const p = provider({});
    (p.requestRefund as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("pagarme_http_503"));
    const r = await processRefunds(p, d);
    expect(r).toEqual([{ orderId: "o1", ok: false }, { orderId: "o2", ok: true }]);
    expect(d.recordRefundFailure).toHaveBeenCalledWith("o1", "pagarme_http_503");
    expect(d.applyPaymentStatus).not.toHaveBeenCalled();
    expect(p.requestRefund).toHaveBeenCalledWith("ch_2", "k2");
  });
  it("adaptador envia a chave de idempotência e não expõe o corpo do erro", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ message: "dados sensíveis" }), { status: 422 }));
    const p = createPagarme("sk_test_x", f as unknown as typeof fetch);
    await expect(p.requestRefund("ch_9", "key-1")).rejects.toThrow("pagarme_http_422");
    const call = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.pagar.me/core/v5/charges/ch_9");
    expect((call[1].headers as Record<string, string>)["Idempotency-Key"]).toBe("key-1");
  });
});
