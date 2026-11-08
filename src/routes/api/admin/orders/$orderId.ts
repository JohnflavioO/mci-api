import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function config() {
  return {
    url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "",
    publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "",
    serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  };
}

async function authorize(request: Request) {
  const c = config();
  if (!c.url || !c.publishableKey || !c.serviceRoleKey) {
    return { response: Response.json({ error: "Servidor administrativo não configurado." }, { status: 503 }) } as const;
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return { response: Response.json({ error: "Sessão administrativa necessária." }, { status: 401 }) } as const;

  const userClient = createClient(c.url, c.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user?.email) return { response: Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) } as const;
  const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", { _role: "admin" });
  if (roleError || isAdmin !== true) return { response: Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) } as const;
  return {
    user: data.user,
    admin: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    publishableKey: c.publishableKey,
    url: c.url,
  } as const;
}

export const Route = createFileRoute("/api/admin/orders/$orderId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;
        if (!UUID.test(params.orderId)) return Response.json({ error: "Pedido inválido." }, { status: 400 });

        const { data: order, error } = await auth.admin.from("orders")
          .select("id,user_id,status,currency,total,provider,provider_order_id,provider_charge_id,provider_checkout_url,payment_link_created_at,shipping_amount,shipping_provider,shipping_service,shipping_cep,shipping_street,shipping_number,shipping_complement,shipping_district,shipping_city,shipping_state,customer_name,customer_document,customer_email,customer_phone,refund_reason,refund_last_error,created_at,updated_at")
          .eq("id", params.orderId).maybeSingle();
        if (error) return Response.json({ error: "Não foi possível carregar os dados completos do pedido." }, { status: 503 });
        if (!order) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });

        const [{ data: items, error: itemsError }, { data: userResult }] = await Promise.all([
          auth.admin.from("order_items").select("id,product_id,name_snapshot,unit_price,qty").eq("order_id", params.orderId).order("name_snapshot"),
          auth.admin.auth.admin.getUserById(order.user_id),
        ]);
        if (itemsError) return Response.json({ error: "Não foi possível carregar os itens do pedido." }, { status: 503 });
        return Response.json({
          order: {
            ...order,
            buyer: {
              id: order.user_id,
              email: order.customer_email || userResult.user?.email || null,
              name: order.customer_name || userResult.user?.user_metadata?.full_name || userResult.user?.user_metadata?.name || null,
              phone: order.customer_phone || userResult.user?.phone || null,
            },
            items: items ?? [],
          },
        });
      },
      DELETE: async ({ request, params }) => {
        const auth = await authorize(request);
        if ("response" in auth) return auth.response;
        if (!UUID.test(params.orderId)) return Response.json({ error: "Pedido inválido." }, { status: 400 });

        const body = await request.json().catch(() => null) as { password?: unknown; confirmation?: unknown } | null;
        const password = typeof body?.password === "string" ? body.password : "";
        if (!password || password.length > 256) return Response.json({ error: "Informe a senha atual do administrador." }, { status: 400 });
        if (body?.confirmation !== "EXCLUIR") return Response.json({ error: "Confirme a exclusão do pedido." }, { status: 400 });

        // Reautentica o próprio usuário administrativo com senha atual antes da ação destrutiva.
        const verifyClient = createClient(auth.url, auth.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error: passwordError } = await verifyClient.auth.signInWithPassword({
          email: auth.user.email!,
          password,
        });
        if (passwordError) return Response.json({ error: "Senha do administrador incorreta." }, { status: 401 });

        const { data: order, error: orderError } = await auth.admin.from("orders")
          .select("id,status,provider,provider_charge_id").eq("id", params.orderId).maybeSingle();
        if (orderError) return Response.json({ error: "Não foi possível validar o pedido para exclusão." }, { status: 503 });
        if (!order) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });

        // Não permite apagar pedidos com pagamento confirmado/cobrança; isso preserva histórico financeiro e estoque.
        if (order.status === "paid" || order.status === "refund_required" || order.status === "refunded" || order.provider_charge_id) {
          return Response.json({ error: "Este pedido possui registro financeiro. Não pode ser excluído por segurança; trate-o pelo fluxo de estorno/cancelamento." }, { status: 409 });
        }

        const { error: deleteError } = await auth.admin.from("orders").delete()
          .eq("id", params.orderId)
          .in("status", ["pending_payment", "rejected", "cancelled"])
          .is("provider_charge_id", null);
        if (deleteError) return Response.json({ error: "Não foi possível excluir o pedido. Verifique os vínculos e tente novamente." }, { status: 503 });
        return Response.json({ success: true, orderId: params.orderId });
      },
    },
  },
});
