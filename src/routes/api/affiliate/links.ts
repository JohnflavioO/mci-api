import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function config() {
  return { url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "", publishableKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "", serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "" };
}
async function authorize(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const c = config();
  if (!c.url || !c.publishableKey || !c.serviceRoleKey) return { response: Response.json({ error: "Servidor Supabase não configurado." }, { status: 503 }) } as const;
  const user = createClient(c.url, c.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ error: "Sessão inválida." }, { status: 401 }) } as const;
  const { data: allowed } = await user.rpc("has_role", { _role: "afiliado" });
  if (allowed !== true) return { response: Response.json({ error: "Acesso restrito a afiliados." }, { status: 403 }) } as const;
  return { userId: data.user.id, db: createClient(c.url, c.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
}

export const Route = createFileRoute("/api/affiliate/links")({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const { data, error } = await auth.db.from("affiliate_links")
        .select("id,product_id,slug,is_active,created_at,products(name)")
        .eq("affiliate_id", auth.userId).order("created_at", { ascending: false });
      if (error) return Response.json({ error: "Não foi possível carregar seus links." }, { status: 503 });
      const links = await Promise.all((data ?? []).map(async (link) => {
        const { count } = await auth.db.from("link_clicks").select("id", { count: "exact", head: true }).eq("link_id", link.id).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
        return { ...link, clicks30d: count ?? 0 };
      }));
      return Response.json({ links });
    },
    DELETE: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const linkId = new URL(request.url).searchParams.get("id") ?? "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(linkId)) {
        return Response.json({ error: "Link inválido." }, { status: 400 });
      }
      const { data, error } = await auth.db.from("affiliate_links")
        .update({ is_active: false })
        .eq("id", linkId)
        .eq("affiliate_id", auth.userId)
        .eq("is_active", true)
        .select("id")
        .maybeSingle();
      if (error) return Response.json({ error: "Não foi possível excluir o link." }, { status: 503 });
      if (!data) return Response.json({ error: "Link não encontrado ou já excluído." }, { status: 404 });
      return Response.json({ success: true });
    },
    POST: async ({ request }) => {
      const auth = await authorize(request);
      if ("response" in auth) return auth.response;
      const body = await request.json().catch(() => null) as { product_id?: unknown } | null;
      const productId = typeof body?.product_id === "string" ? body.product_id : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) return Response.json({ error: "Produto inválido." }, { status: 400 });
      const [{ data: profile }, { data: product }] = await Promise.all([
        auth.db.from("affiliate_profiles").select("status").eq("user_id", auth.userId).maybeSingle(),
        auth.db.from("products").select("id,status").eq("id", productId).maybeSingle(),
      ]);
      if (profile?.status !== "active") return Response.json({ error: "Seu cadastro de afiliado não está ativo." }, { status: 403 });
      if (product?.status !== "published") return Response.json({ error: "Produto não disponível para divulgação." }, { status: 404 });
      const { data: existing } = await auth.db.from("affiliate_links").select("id,slug,is_active").eq("affiliate_id", auth.userId).eq("product_id", productId).maybeSingle();
      if (existing) {
        if (!existing.is_active) {
          const { data: restored, error: restoreError } = await auth.db.from("affiliate_links")
            .update({ is_active: true }).eq("id", existing.id).eq("affiliate_id", auth.userId)
            .select("id,slug,is_active").single();
          if (restoreError) return Response.json({ error: "Não foi possível reativar seu link." }, { status: 503 });
          return Response.json({ link: restored });
        }
        return Response.json({ link: existing });
      }
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
        const { data, error } = await auth.db.from("affiliate_links").insert({ affiliate_id: auth.userId, product_id: productId, slug }).select("id,slug,is_active").single();
        if (!error && data) return Response.json({ link: data });
        if (error?.code !== "23505") return Response.json({ error: "Não foi possível gerar o link." }, { status: 503 });
      }
      return Response.json({ error: "Não foi possível gerar um código exclusivo. Tente novamente." }, { status: 503 });
    },
  }},
});
