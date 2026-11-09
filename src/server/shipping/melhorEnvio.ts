import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const CALLBACK_PATH = "/api/shipping/melhor-envio/callback";
export const melhorEnvioCallbackUrl = () =>
  (process.env["MELHOR_ENVIO_REDIRECT_URI"] || `${(process.env["APP_BASE_URL"] || "https://mci-xpress.vercel.app").replace(/\/$/, "")}${CALLBACK_PATH}`);

export function melhorEnvioConfig() {
  return {
    clientId: process.env["MELHOR_ENVIO_CLIENT_ID"] || "",
    clientSecret: process.env["MELHOR_ENVIO_CLIENT_SECRET"] || "",
    redirectUri: melhorEnvioCallbackUrl(),
    baseUrl: process.env["MELHOR_ENVIO_ENVIRONMENT"] === "sandbox"
      ? "https://sandbox.melhorenvio.com.br"
      : "https://melhorenvio.com.br",
    userAgent: "STORE HOUSE (mcisc@mcistore.com.br)",
  };
}

function encryptionKey() {
  const value = process.env["MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY"] || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY precisa ter 64 caracteres hexadecimais.");
  return Buffer.from(value, "hex");
}
export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptToken(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Credencial Melhor Envio inválida.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
export function shippingAdminClient() {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (!url || !key) throw new Error("Supabase não configurado no servidor.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}


type StoredCredential = {
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
};

export async function getValidMelhorEnvioAccessToken() {
  const config = melhorEnvioConfig();
  const db = shippingAdminClient();
  const { data, error } = await db.from("shipping_provider_credentials")
    .select("access_token_encrypted,refresh_token_encrypted,token_expires_at")
    .eq("provider", "melhor_envio").maybeSingle();
  if (error || !data) throw new Error("A conta Melhor Envio não está autorizada. Conecte novamente em Administração > Configurações.");
  const stored = data as StoredCredential;
  const expiresAt = new Date(stored.token_expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 120_000) return decryptToken(stored.access_token_encrypted);
  if (!config.clientId || !config.clientSecret) throw new Error("Credenciais do aplicativo Melhor Envio não configuradas.");
  const refreshToken = decryptToken(stored.refresh_token_encrypted);
  const response = await fetch(config.baseUrl + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": config.userAgent },
    body: JSON.stringify({ grant_type: "refresh_token", client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, redirect_uri: config.redirectUri }),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string" || typeof payload.refresh_token !== "string") throw new Error("A autorização do Melhor Envio expirou. Reconecte a conta nas configurações.");
  const expiresIn = Number(payload.expires_in) || 2592000;
  const update: Record<string, unknown> = {
    access_token_encrypted: encryptToken(payload.access_token),
    refresh_token_encrypted: encryptToken(payload.refresh_token),
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (typeof payload.scope === "string") update.scopes = payload.scope.split(/[ ,]+/).filter(Boolean);
  const { error: saveError } = await db.from("shipping_provider_credentials").update(update).eq("provider", "melhor_envio");
  if (saveError) throw new Error("Não foi possível renovar a autorização do Melhor Envio.");
  return payload.access_token;
}
