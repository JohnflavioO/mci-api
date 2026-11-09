import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const CALLBACK_PATH = "/api/shipping/melhor-envio/callback";
export const melhorEnvioCallbackUrl = () =>
  (process.env["MELHOR_ENVIO_REDIRECT_URI"] || `${(process.env["APP_BASE_URL"] || "https://mci-xpress.vercel.app").replace(/\\/$/, "")}${CALLBACK_PATH}`);

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
