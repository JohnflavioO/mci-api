import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/orders/$orderId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
        const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
        if (!url || !publishableKey || !serviceRoleKey) {
          return Response.json({ error: "Serviço de pedidos não configurado." }, { status: 503 });
        }
        if (!UUID.test(params.orderId)) return Response.json({ error: "Pedido inválido." }, { status: 400 });

        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\\s+/i, "");
        if (!token) return Response.json({ error: "Entre na sua conta para excluir o pedido." }, { status: 401 });

        const userClient = createClient(url, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: auth, error: authError } = await userClient.auth.getUser(token);
        if (authError || !auth.user) return Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 });

        const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: order, error: orderError } = await db.from("orders")
          .select("id,user_id,status,provider_charge_id,provider_checkout_url,payment_link_created_at")
          .eq("id", params.orderId).eq("user_id", auth.user.id).maybeSingle();

        if (orderError) return Response.json({ error: "Não foi possível validar o pedido." }, { status: 503 });
        if (!order) return Response.json({ error: "Pedido não encontrado nesta conta." }, { status: 404 });

        if (order.status !== "pending_payment" && order.status !== "rejected") {
          return Response.json({ error: "Somente pedidos não pagos podem ser excluídos." }, { status: 409 });
        }
        if (order.provider_charge_id || order.provider_checkout_url || order.payment_link_created_at) {
          return Response.json({ error: "Este pedido já teve checkout iniciado. Não é possível excluí-lo por aqui." }, { status: 409 });
        }

        const { data: deleted, error: deleteError } = await db.from("orders").delete()
          .eq("id", params.orderId)
          .eq("user_id", auth.user.id)
          .in("status", ["pending_payment", "rejected"])
          .is("provider_charge_id", null)
          .is("provider_checkout_url", null)
          .is("payment_link_created_at", null)
          .select("id")
          .maybeSingle();

        if (deleteError) return Response.json({ error: "Não foi possível excluir o pedido. Tente novamente." }, { status: 503 });
        if (!deleted) return Response.json({ error: "O pedido foi atualizado e não pode mais ser excluído." }, { status: 409 });
        return Response.json({ success: true, orderId: deleted.id });
      },
    },
  },
});
