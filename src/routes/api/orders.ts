import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createInfinitePayCheckout } from "@/server/payments/infinitepay";
import { infinitePayConfig } from "@/server/payments/infinitepay-config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (value: unknown, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";

export const Route = createFileRoute("/api/orders")({
  server: { handlers: {
    POST: async ({ request }) => {
      const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
      const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
      const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
      const paymentConfig = infinitePayConfig();
      if (!url || !publishableKey || !serviceRoleKey) return Response.json({ error: "Criação de pedidos não configurada no servidor." }, { status: 503 });
      if (!paymentConfig) return Response.json({ error: "Checkout InfinitePay ainda não foi configurado no servidor." }, { status: 503 });
      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!token) return Response.json({ error: "Entre na sua conta antes de finalizar." }, { status: 401 });
      const userClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: auth, error: authError } = await userClient.auth.getUser(token);
      if (authError || !auth.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });
      const body = await request.json().catch(() => null) as {
        items?: unknown; idempotency_key?: unknown;
        customer?: { name?: unknown; email?: unknown; phone?: unknown };
        address?: { cep?: unknown; street?: unknown; number?: unknown; complement?: unknown; district?: unknown; city?: unknown; state?: unknown };
      } | null;
      if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 50) return Response.json({ error: "Itens do pedido inválidos." }, { status: 400 });
      const items = body.items.map((item) => {
        const row = item as { product_id?: unknown; qty?: unknown };
        return { product_id: row.product_id, qty: row.qty };
      });
      if (items.some((item) => typeof item.product_id !== "string" || !UUID.test(item.product_id) || !Number.isInteger(item.qty) || Number(item.qty) < 1 || Number(item.qty) > 999)) return Response.json({ error: "Revise os produtos e quantidades." }, { status: 400 });
      const idempotencyKey = typeof body?.idempotency_key === "string" && UUID.test(body.idempotency_key) ? body.idempotency_key : crypto.randomUUID();
      const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: orderId, error: createError } = await db.rpc("create_order_with_affiliate", {
        p_user_id: auth.user.id,
        p_idempotency_key: idempotencyKey,
        p_items: items,
        p_affiliate_link_id: null,
        p_visitor_id: null,
        p_has_coupon: false,
        p_has_volume_discount: false,
      });
      if (createError || typeof orderId !== "string") {
        return Response.json({ error: createError?.code === "23514" ? "Um produto está indisponível, sem estoque ou teve seu preço alterado. Revise o carrinho." : "Não foi possível criar o pedido. Confira os produtos, preços e estoque." }, { status: 400 });
      }
      const { data: order, error: orderError } = await db.from("orders")
        .select("id,total,status,provider,provider_checkout_url,shipping_amount")
        .eq("id", orderId).eq("user_id", auth.user.id).single();
      if (orderError || !order) return Response.json({ error: "Pedido criado, mas não foi possível carregar seus dados para pagamento." }, { status: 503 });
      if (order.status !== "pending_payment") return Response.json({ error: "Este pedido não está mais aguardando pagamento." }, { status: 409 });
      if (order.provider && order.provider !== "infinitepay") return Response.json({ error: "Este pedido já está vinculado a outro meio de pagamento." }, { status: 409 });
      if (order.provider_checkout_url) return Response.json({ order_id: order.id, checkout_url: order.provider_checkout_url, total: Number(order.total) }, { status: 200 });

      const { data: orderItems, error: itemsError } = await db.from("order_items")
        .select("name_snapshot,qty,unit_price").eq("order_id", order.id).order("name_snapshot");
      if (itemsError || !orderItems?.length) return Response.json({ error: "Não foi possível montar os itens do pagamento." }, { status: 503 });

      const customer = {
        name: clean(body?.customer?.name, 120) || clean(auth.user.user_metadata?.["full_name"], 120),
        email: clean(body?.customer?.email, 254) || clean(auth.user.email, 254),
        phone: clean(body?.customer?.phone, 30) || clean(auth.user.user_metadata?.["phone"], 30),
      };
      const address = {
        cep: clean(body?.address?.cep, 12),
        street: clean(body?.address?.street, 180),
        number: clean(body?.address?.number, 30),
        complement: clean(body?.address?.complement, 100),
        district: clean(body?.address?.district, 100),
        city: clean(body?.address?.city, 100),
        state: clean(body?.address?.state, 2).toUpperCase(),
      };
      let checkoutUrl: string;
      try {
        checkoutUrl = await createInfinitePayCheckout(paymentConfig, {
          orderId: order.id,
          items: orderItems.map((item) => ({ name: item.name_snapshot, qty: item.qty, unitPrice: Number(item.unit_price) })),
          shippingAmount: Number(order.shipping_amount ?? 0),
          customer,
          address,
        });
      } catch {
        return Response.json({ error: "Não foi possível gerar o checkout na InfinitePay. Seu pedido foi preservado; tente novamente." }, { status: 502 });
      }
      const { error: saveError } = await db.from("orders").update({
        provider: "infinitepay",
        provider_order_id: order.id,
        provider_checkout_url: checkoutUrl,
        payment_link_created_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "pending_payment");
      if (saveError) return Response.json({ error: "O link foi criado, mas não foi possível registrar o pagamento. Tente novamente; o mesmo pedido será reutilizado." }, { status: 503 });
      return Response.json({ order_id: order.id, checkout_url: checkoutUrl, total: Number(order.total) }, { status: 201 });
    },
  }},
});
