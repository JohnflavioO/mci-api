import { createFileRoute } from "@tanstack/react-router";
import { infinitePayConfig } from "@/server/payments/infinitepay-config";

export const Route = createFileRoute("/api/public/infinitepay-health")({
  server: {
    handlers: {
      GET: async () => {
        const configured = infinitePayConfig() !== null;
        return Response.json(
          { provider: "infinitepay", configured },
          { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
