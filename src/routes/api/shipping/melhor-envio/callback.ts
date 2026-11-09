import { createFileRoute } from "@tanstack/react-router";
import { encryptToken, melhorEnvioConfig, shippingAdminClient } from "@/server/shipping/melhorEnvio";

const cookieValue = (request: Request, name: string) => {
  const part = (request.headers.get("cookie") || "").split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
};

export const Route = createFileRoute("/api/shipping/melhor-envio/callback")({
  server: { handlers: {
    GET: async ({ request }) => {
      const current = new URL(request.url);
      const code = current.searchParams.get("code") || "";
      const state = current.searchParams.get("state") || "";
      const expectedState = cookieValue(request, "me_oauth_state");
      const clearCookie = "me_oauth_state=; Path=/api/shipping/melhor-envio/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
      const appUrl = (process.env["APP_BASE_URL"] || "https://mci-xpress.vercel.app").replace(/\/$/, "");
      const finish = (result: string, status = 303) => new Response(null, { status, headers: { Location: `${appUrl}/admin/pedidos?melhor_envio=${encodeURIComponent(result)}`, "Set-Cookie": clearCookie, "Cache-Control": "no-store" } });
      if (!code || !state || !expectedState || state !== expectedState) return finish("state_invalid");
      const config = melhorEnvioConfig();
      if (!config.clientId || !config.clientSecret) return finish("app_not_configured");
      try {
        const tokenResponse = await fetch(`${config.baseUrl}/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": config.userAgent },
          body: JSON.stringify({
            grant_type: "authorization_code",
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            code,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const tokenData = await tokenResponse.json().catch(() => ({})) as Record<string, unknown>;
        if (!tokenResponse.ok || typeof tokenData.access_token !== "string" || typeof tokenData.refresh_token !== "string") {
          return finish("token_exchange_failed");
        }
        const expiresIn = Number(tokenData.expires_in) || 2592000;
        const scopes = typeof tokenData.scope === "string" ? tokenData.scope.split(/[ ,]+/).filter(Boolean) : ["shipping-calculate", "shipping-companies", "ecommerce-shipping"];
        const db = shippingAdminClient();
        const { error } = await db.from("shipping_provider_credentials").upsert({
          provider: "melhor_envio",
          access_token_encrypted: encryptToken(tokenData.access_token),
          refresh_token_encrypted: encryptToken(tokenData.refresh_token),
          token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
          scopes,
          updated_at: new Date().toISOString(),
        }, { onConflict: "provider" });
        if (error) return finish("token_storage_failed");
        return finish("connected");
      } catch {
        return finish("connection_failed");
      }
    },
  } },
});
