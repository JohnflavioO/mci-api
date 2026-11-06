import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/infinitepay-webhook")({
  server: { handlers: {
    POST: async ({ request }) => {
      const { infinitePayConfig } = await import("@/server/payments/infinitepay-config");
      const { reconcileInfinitePayPayment } = await import("@/server/payments/infinitepay-reconcile");
      const config = infinitePayConfig();
      if (!config) return new Response("InfinitePay indisponível", { status: 503 });
      const raw = await request.text();
      if (raw.length > 50_000) return new Response("Payload grande demais", { status: 413 });
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return new Response("JSON inválido", { status: 400 }); }
      const event = String(body["event"] ?? body["type"] ?? "");
      // Webhooks InfinitePay não possuem assinatura. Só o payment_check autoritativo pode aprovar.
      if (event && event !== "paid" && event !== "settled") return Response.json({ outcome: "event_requires_manual_reconciliation" }, { status: 200 });
      const orderNsu = typeof body["order_nsu"] === "string" ? body["order_nsu"] : "";
      const transactionNsu = typeof body["transaction_nsu"] === "string" ? body["transaction_nsu"] : "";
      const invoiceSlug = typeof body["invoice_slug"] === "string" ? body["invoice_slug"] : typeof body["slug"] === "string" ? body["slug"] : "";
      const receiptUrl = typeof body["receipt_url"] === "string" ? body["receipt_url"] : null;
      const result = await reconcileInfinitePayPayment(config, { orderNsu, transactionNsu, invoiceSlug, receiptUrl });
      return Response.json({ outcome: result.outcome }, { status: result.http });
    },
  }},
});
