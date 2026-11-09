import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { melhorEnvioConfig } from "@/server/shipping/melhorEnvio";

export const Route = createFileRoute("/api/shipping/melhor-envio/connect")({
  server: { handlers: {
    POST: async ({ request }) => {
      const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");
      if (!url || !key || !token) return Response.json({ error: "Sessão administrativa necessária." }, { status: 401 });
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: auth, error } = await client.auth.getUser(token);
      if (error || !auth.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });
      const { data: isAdmin, error: roleError } = await client.rpc("has_role", { _role: "admin" });
      if (roleError || isAdmin !== true) return Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

      const config = melhorEnvioConfig();
      if (!config.clientId || !config.clientSecret) return Response.json({ error: "Cadastre MELHOR_ENVIO_CLIENT_ID e MELHOR_ENVIO_CLIENT_SECRET nas variáveis privadas da Vercel." }, { status: 503 });
      const state = randomBytes(32).toString("base64url");
      const scopes = ["shipping-calculate"];
      const authorize = new URL("/oauth/authorize", config.baseUrl);
      authorize.searchParams.set("client_id", config.clientId);
      authorize.searchParams.set("redirect_uri", config.redirectUri);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("state", state);
      authorize.searchParams.set("scope", scopes.join(" "));
      return Response.json({ authorizationUrl: authorize.toString() }, {
        headers: {
          "Set-Cookie": `me_oauth_state=${state}; Path=/api/shipping/melhor-envio/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
          "Cache-Control": "no-store",
        },
      });
    },
  } },
});
