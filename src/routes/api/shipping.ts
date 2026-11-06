import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { storeShippingConfig, shippingProviderStatus } from "@/server/shipping/config";

type Product = { id: string; name: string; weight_kg: number | string | null; height_cm: number | string | null; width_cm: number | string | null; length_cm: number | string | null };
const digits = (v: unknown) => typeof v === "string" ? v.replace(/\D/g, "") : "";
const number = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const money = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const parsed = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
};
async function correiosToken(config: ReturnType<typeof storeShippingConfig>) {
  const c = config.correios;
  const credentials = Buffer.from(`${c.usuario}:${c.codigoAcesso}`).toString("base64");
  const response = await fetch(`${c.apiBaseUrl}/token/v1/autentica/cartaopostagem`, {
    method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ numero: c.cartaoPostagem, contrato: c.contrato, dr: Number(c.dr) }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof data.token !== "string") throw new Error("Não foi possível autenticar nos Correios. Verifique as credenciais e permissões da API.");
  return data.token;
}

export const Route = createFileRoute("/api/shipping")({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const config = storeShippingConfig();
        const providers = shippingProviderStatus(config);
        const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
        const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
        if (!url || !publishableKey || !serviceRoleKey) return Response.json({ error: "Serviço de frete não configurado no servidor." }, { status: 503 });
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ error: "Sessão necessária para cotar o frete." }, { status: 401 });
        const user = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: auth, error: authError } = await user.auth.getUser(token);
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
          .select("id,name,weight_kg,height_cm,width_cm,length_cm").in("id", ids).eq("status", "published");
        if (productsError || !products || products.length !== ids.length) return Response.json({ error: "Não foi possível validar os produtos do carrinho." }, { status: 400 });
        const byId = new Map((products as Product[]).map((p) => [p.id, p]));
        let weightKg = 0, heightCm = 0, widthCm = 0, lengthCm = 0, volumeCm3 = 0;
        for (const item of requested) {
          const p = byId.get(item.id)!;
          const w = number(p.weight_kg), h = number(p.height_cm), wi = number(p.width_cm), l = number(p.length_cm);
          if (!w || !h || !wi || !l) return Response.json({ error: `Complete peso e dimensões do produto "${p.name}" no cadastro para calcular o frete.` }, { status: 422 });
          weightKg += w * item.qty;
          volumeCm3 += h * wi * l * item.qty;
          // Modelo de consolidação conservador: itens empilhados, mantendo a maior base.
          heightCm += h * item.qty;
          widthCm = Math.max(widthCm, wi);
          lengthCm = Math.max(lengthCm, l);
        }
        // Limites de pacote dos Correios: 100 cm por dimensão e soma máxima de 200 cm.
        const dims = [heightCm, widthCm, lengthCm].sort((a, b) => b - a);
        const packageDims = { comprimento: Math.ceil(dims[0]), largura: Math.ceil(dims[1]), altura: Math.ceil(dims[2]) };
        if (weightKg > 30 || dims.some((v) => v > 100) || dims.reduce((a, b) => a + b, 0) > 200) {
          return Response.json({ error: "A embalagem consolidada excede os limites de cotação dos Correios. Solicite atendimento para esse pedido." }, { status: 422 });
        }
        const options: Array<{ id: string; provider: string; service: string; price: number; delivery_days: number | null; description: string; quote_token: string }> = [];
        if (providers.pickup === "ready") options.push({ id: "pickup", provider: "pickup", service: config.pickup.name, price: 0, delivery_days: null, description: [config.pickup.address, config.pickup.instructions].filter(Boolean).join(" · ") || "Retirada no local", quote_token: "" });
        if (providers.correios === "ready") {
          const token = await correiosToken(config);
          const codes = config.correios.serviceCodes;
          const results = await Promise.all(codes.map(async (code) => {
            const params = new URLSearchParams({
              cepOrigem: config.originCep, cepDestino: destinationCep, psObjeto: String(Math.max(1, Math.ceil(weightKg * 1000))),
              tpObjeto: "2", comprimento: String(packageDims.comprimento), largura: String(packageDims.largura), altura: String(packageDims.altura),
              nuContrato: config.correios.contrato, nuDR: config.correios.dr,
            });
            const response = await fetch(`${config.correios.apiBaseUrl}/preco/v1/nacional/${encodeURIComponent(code)}?${params}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(12000),
            });
            const data = await response.json().catch(() => ({})) as Record<string, unknown>;
            if (!response.ok) return null;
            const price = money(data.pcFinal ?? data.pcProduto ?? data.pcBase);
            if (!Number.isFinite(price) || price < 0) return null;
            const label = code === "03298" ? "PAC" : code === "03220" ? "SEDEX" : `Correios ${code}`;
            const days = Number(data.prazoEntrega ?? data.prazo ?? NaN);
            return { id: `correios-${code}`, provider: "correios", service: label, price, delivery_days: Number.isFinite(days) ? days : null, description: "Cotação oficial dos Correios", quote_token: "" };
          }));
          options.push(...results.filter((v): v is NonNullable<typeof v> => v !== null));
        }
        if (providers.jamef === "ready") {
          // A Jamef exige endpoint/contrato de autenticação e parâmetros específicos da unidade;
          // não apresentar preço fictício enquanto a integração autenticada não retornar cotação.
        }
        const quoteSecret = process.env["SHIPPING_QUOTE_SECRET"] || serviceRoleKey;
        const signedOptions = options.map((option) => {
          const payload = Buffer.from(JSON.stringify({ id: option.id, provider: option.provider, service: option.service, price: option.price, cep: destinationCep, items: requested, exp: Date.now() + 15 * 60 * 1000 })).toString("base64url");
          const signature = createHmac("sha256", quoteSecret).update(payload).digest("base64url");
          return { ...option, quote_token: payload + "." + signature };
        });
        return Response.json({
          options: signedOptions,
          package: { weight_kg: Number(weightKg.toFixed(3)), volume_cm3: Math.ceil(volumeCm3), ...packageDims },
          providers: { correios: providers.correios, jamef: providers.jamef, pickup: providers.pickup },
          notices: options.length ? [] : ["Nenhuma modalidade de envio retornou cotação. Verifique as configurações dos transportadores."],
        });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Falha ao consultar opções de frete." }, { status: 502 });
      }
    },
  } },
});
