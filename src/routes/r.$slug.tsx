import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const config = () => ({
  url: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "",
  key: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
});
const cookie = (request: Request, name: string) => {
  const raw = request.headers.get("cookie") ?? "";
  const item = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
};
async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
function productPath(name: string) {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return "/produto/" + slug;
}
function redirect(path: string, headers = new Headers()) {
  headers.set("Location", path);
  return new Response(null, { status: 302, headers });
}

export const Route = createFileRoute("/r/$slug")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const c = config();
      if (!c.url || !c.key) return redirect("/");
      const db = createClient(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: link } = await db.from("affiliate_links")
        .select("id,affiliate_id,product_id,is_active").eq("slug", params.slug).maybeSingle();
      if (!link) return redirect("/");
      const { data: product } = await db.from("products").select("name,status").eq("id", link.product_id).maybeSingle();
      const destination = product?.name ? productPath(product.name) : "/";
      if (!link.is_active || product?.status !== "published") return redirect(destination);
      const [{ data: affiliate }, { data: settings }] = await Promise.all([
        db.from("affiliate_profiles").select("status").eq("user_id", link.affiliate_id).maybeSingle(),
        db.from("affiliate_settings").select("enabled,attribution_window_days").eq("id", true).single(),
      ]);
      if (affiliate?.status !== "active" || !settings?.enabled) return redirect(destination);
      const ua = request.headers.get("user-agent") ?? "";
      if (/bot|crawler|spider|slurp|preview|headless|facebookexternalhit|whatsapp|telegrambot|bingpreview/i.test(ua)) return redirect(destination);
      const visitorId = cookie(request, "aff_visitor") || crypto.randomUUID();
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "";
      const secret = process.env["AFFILIATE_HASH_SECRET"] ?? c.key;
      const [ipHash, uaHash] = await Promise.all([digest(secret + ":" + ip), digest(secret + ":" + ua)]);
      await db.rpc("record_affiliate_link_click", {
        p_link_id: link.id, p_visitor_id: visitorId, p_ip_hash: ipHash, p_user_agent_hash: uaHash,
      });
      const maxAge = Math.max(1, settings.attribution_window_days) * 86400;
      const headers = new Headers();
      headers.append("Set-Cookie", `aff_ref=${encodeURIComponent(link.id)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      headers.append("Set-Cookie", `aff_visitor=${encodeURIComponent(visitorId)}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`);
      return redirect(destination, headers);
    },
  }},
});
