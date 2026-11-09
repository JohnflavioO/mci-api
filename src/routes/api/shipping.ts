import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { getValidMelhorEnvioAccessToken, melhorEnvioConfig } from "@/server/shipping/melhorEnvio";
import { storeShippingConfig } from "@/server/shipping/config";

type Product = {
  id: string; name: string; product_prices: { customer_price: number | string | null } | { customer_price: number | string | null }[] | null;
  weight_kg: number | string | null; height_cm: number | string | null;
  width_cm: number | string | null; length_cm: number | string | null;
};
type MelhorEnvioService = {
  id: number | string; name: string; price?: string | number; custom_price?: string | number;
  delivery_time?: number; custom_delivery_time?: number; has_error?: boolean | string;
  error?: string; company?: { id?: number | string; name?: string };
};
const digits = (v: unknown) => typeof v === "string" ? v.replace(/\D/g, "") : "";
const positive = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const parseMoney = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

export const Route = createFileRoute("/api/shipping")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const config = storeShippingConfig();
        const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
        const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
        if (!url || !publishableKey || !serviceRoleKey) return Response.json({ error: "Serviço de frete não configurado no servidor." }, { status: 503 });
        const sessionToken = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!sessionToken) return Response.json({ error: "Sessão necessária para cotar o frete." }, { status: 401 });
        const user = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: auth, error: authError } = await user.auth.getUser(sessionToken);
        if (authError || !auth.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });
        const body = await request.json().catch(() => null) as { cep?: unknown; items?: unknown } | null;
        const destinationCep = digits(body?.cep);
        if (destinationCep.length !== 8) return Response.json({ error: "Informe um CEP de destino válido." }, { status: 400 });
        if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 50) return Response.json({ error: "Carrinho inválido para cotação." }, { status: 400 });
        const requested = body.items.map((item) => {
          const row = item as { product_id?: unknown; qty?: unknown };
          return { id: typeof row.product_id === "string" ? row.product_id : "", qty: Number(row.qty) };
        });
        if (requested.some((i) => !/^[0-9a-f-]{36}$/i.test(i.id) || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 999)) return Response.json({ error: "Produtos ou quantidades inválidos." }, { status: 400 });
        const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const ids = [...new Set(requested.map((i) => i.id))];
        const { data: products, error: productsError } = await db.from("products")
          .select("id,name,weight_kg,height_cm,width_cm,length_cm,product_prices(customer_price)").in("id", ids).eq("status", "published");
        if (productsError || !products || products.length !== ids.length) return Response.json({ error: "Não foi possível validar os produtos do carrinho." }, { status: 400 });
        const byId = new Map((products as Product[]).map((p) => [p.id, p]));
        const productsSubtotal = Number(requested.reduce((sum, item) => {
          const product = byId.get(item.id)!;
          const price = positive(Array.isArray(product.product_prices) ? product.product_prices[0]?.customer_price : product.product_prices?.customer_price);
          return sum + price * item.qty;
        }, 0).toFixed(2));
        const quoteProducts = requested.map((item) => {
          const product = byId.get(item.id)!;
          const weight = positive(product.weight_kg), height = positive(product.height_cm), width = positive(product.width_cm), length = positive(product.length_cm);
          if (!weight || !height || !width || !length) throw new Error("Complete peso e dimensões do produto \"" + product.name + "\" no cadastro para calcular o frete.");
          return {
            id: product.id,
            width: Math.ceil(width), height: Math.ceil(height), length: Math.ceil(length),
            weight: Number(weight.toFixed(3)),
            insurance_value: Math.max(0.01, positive(Array.isArray(product.product_prices) ? product.product_prices[0]?.customer_price : product.product_prices?.customer_price)),
            quantity: item.qty,
          };
        });
        const accessToken = await getValidMelhorEnvioAccessToken();
        const me = melhorEnvioConfig();
        const response = await fetch(me.baseUrl + "/api/v2/me/shipment/calculate", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": me.userAgent,
          },
          body: JSON.stringify({
            from: { postal_code: config.originCep },
            to: { postal_code: destinationCep },
            products: quoteProducts,
            options: { receipt: false, own_hand: false },
          }),
          signal: AbortSignal.timeout(20000),
        });
        const responseBody = await response.json().catch(() => ({})) as unknown;
        if (!response.ok) {
          const details = responseBody && typeof responseBody === "object" ? JSON.stringify(responseBody) : "";
          console.error("Melhor Envio quote failed", response.status, details.slice(0, 1200));
          return Response.json({ error: response.status === 401 ? "A autorização do Melhor Envio expirou. Reconecte a conta nas configurações." : "O Melhor Envio não conseguiu calcular este envio. Confira CEP e dimensões dos produtos." }, { status: 502 });
        }
        const services = Array.isArray(responseBody) ? responseBody as MelhorEnvioService[] : [];
        const options = services.filter((service) => {
          const price = parseMoney(service.custom_price ?? service.price);
          return service.has_error !== true && service.has_error !== "true" && Number.isFinite(price) && price > 0;
        }).map((service) => {
          const price = Number(parseMoney(service.custom_price ?? service.price).toFixed(2));
          const company = service.company?.name || "Transportadora";
          const name = service.name || "Frete";
          const days = Number(service.custom_delivery_time ?? service.delivery_time);
          return {
            id: "melhor-envio-" + String(service.id),
            provider: company,
            service: name,
            price,
            delivery_days: Number.isFinite(days) && days > 0 ? days : null,
            description: "Cotação Melhor Envio · " + company,
            quote_token: "",
          };
        });
        if (config.pickup.enabled) options.push({
          id: "pickup", provider: "pickup", service: "Retirada no local", price: 0,
          delivery_days: null,
          description: [config.pickup.address, config.pickup.instructions].filter(Boolean).join(" · ") || "Armazém Sanco",
          quote_token: "",
        });
        const quoteSecret = process.env["SHIPPING_QUOTE_SECRET"] || serviceRoleKey;
        const signedOptions = options.map((option) => {
          const payload = Buffer.from(JSON.stringify({
            id: option.id, provider: option.provider, service: option.service, price: option.price,
            cep: destinationCep, items: requested, exp: Date.now() + 15 * 60 * 1000,
          })).toString("base64url");
          const signature = createHmac("sha256", quoteSecret).update(payload).digest("base64url");
          return { ...option, quote_token: payload + "." + signature };
        });
        return Response.json({
          options: signedOptions,
          products_subtotal: productsSubtotal,
          providers: { melhor_envio: "ready", pickup: config.pickup.enabled ? "ready" : "disabled" },
          notices: signedOptions.length ? [] : ["O Melhor Envio não retornou modalidades para este CEP e pacote."],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao consultar opções de frete.";
        return Response.json({ error: message }, { status: 502 });
      }
    },
  } },
});
