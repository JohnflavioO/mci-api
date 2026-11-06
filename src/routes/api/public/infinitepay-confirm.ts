import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/infinitepay-confirm")({
  server: { handlers: {
    POST: async ({ request }) => {
      const { infinitePayConfig } = await import("@/server/payments/infinitepay-config");
      const { reconcileInfinitePayPayment } = await import("@/server/payments/infinitepay-reconcile");
      const config = infinitePayConfig();
      if (!config) return Response.json({ error: "Confirmação de pagamento indisponível." }, { status: 503 });
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const orderNsu = typeof body?.["order_nsu"] === "string" ? body["order_nsu"] : "";
      const transactionNsu = typeof body?.["transaction_nsu"] === "string" ? body["transaction_nsu"] : "";
      const invoiceSlug = typeof body?.["slug"] === "string" ? body["slug"] : "";
      const receiptUrl = typeof body?.["receipt_url"] === "string" ? body["receipt_url"] : null;
      const result = await reconcileInfinitePayPayment(config, { orderNsu, transactionNsu, invoiceSlug, receiptUrl });
      return Response.json({ outcome: result.outcome }, { status: result.http });
    },
  }},
});
