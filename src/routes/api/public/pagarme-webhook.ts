import { createFileRoute } from "@tanstack/react-router";

// Público por necessidade (o Pagar.me chama); autenticado por Basic Auth antes de qualquer processamento.
export const Route = createFileRoute("/api/public/pagarme-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { paymentsConfig, buildDeps } = await import("@/server/payments/config");
        const { verifyBasicAuth } = await import("@/server/payments/pagarme");
        const { handlePaymentWebhook } = await import("@/server/payments/core");
        const c = paymentsConfig();
        if (!c) return new Response("Pagamentos desabilitados", { status: 503 });
        if (!verifyBasicAuth(request.headers.get("authorization"), c.webhookUser, c.webhookPassword)) {
          return new Response("Não autorizado", { status: 401 });
        }
        const text = await request.text();
        if (text.length > 100_000) return new Response("Payload grande demais", { status: 413 });
        let body: unknown = null;
        try { body = JSON.parse(text); } catch { return new Response("JSON inválido", { status: 400 }); }
        const { db, provider } = buildDeps(c);
        const r = await handlePaymentWebhook(body, provider, db);
        return Response.json({ outcome: r.outcome }, { status: r.http });
      },
    },
  },
});
