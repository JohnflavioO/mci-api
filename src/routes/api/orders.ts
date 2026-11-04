import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const readCookie = (request: Request, name: string) => {
  const value = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
};
export const Route = createFileRoute("/api/orders")({
  server: { handlers: {
    POST: async ({ request }) => {
      const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
      const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
      const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
      if (!url || !publishableKey || !serviceRoleKey) return Response.json({ error: "Criação de pedidos não configurada no servidor." }, { status: 503 });
      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!token) return Response.json({ error: "Entre na sua conta antes de finalizar." }, { status: 401 });
      const userClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: auth, error: authError } = await userClient.auth.getUser(token);
      if (authError || !auth.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });
      const body = await request.json().catch(() => null) as { items?: unknown; idempotency_key?: unknown } | null;
      if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 50) return Response.json({ error: "Itens do pedido inválidos." }, { status: 400 });
      const items = body.items.map((item) => {
        const row = item as { product_id?: unknown; qty?: unknown };
        return { product_id: row.product_id, qty: row.qty };
      });
      if (items.some((item) => typeof item.product_id !== "string" || !Number.isInteger(item.qty) || Number(item.qty) < 1 || Number(item.qty) > 999)) return Response.json({ error: "Revise os produtos e quantidades." }, { status: 400 });
      const idempotencyKey = typeof body.idempotency_key === "string" && /^[0-9a-f-]{36}$/i.test(body.idempotency_key) ? body.idempotency_key : crypto.randomUUID();
      const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await db.rpc("create_order_with_affiliate", {
        p_user_id: auth.user.id,
        p_idempotency_key: idempotencyKey,
        p_items: items,
        p_affiliate_link_id: readCookie(request, "aff_ref"),
        p_visitor_id: readCookie(request, "aff_visitor"),
        p_has_coupon: false,
        p_has_volume_discount: false,
      });
      if (error || !data) return Response.json({ error: "Não foi possível criar o pedido. Confira os produtos, preços e estoque." }, { status: 400 });
      return Response.json({ order_id: data, idempotency_key: idempotencyKey }, { status: 201 });
    },
  }},
});
