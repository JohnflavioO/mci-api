import type { InfinitePayConfig } from "./infinitepay";

export function infinitePayConfig(): InfinitePayConfig | null {
  const env = process.env;
  const apiKey = env["INFINITEPAY_API_KEY"] ?? "";
  const handle = (env["INFINITEPAY_HANDLE"] ?? "").replace(/^\$/, "").trim();
  const appBaseUrl = (env["APP_BASE_URL"] ?? (env["VERCEL_PROJECT_PRODUCTION_URL"] ? `https://${env["VERCEL_PROJECT_PRODUCTION_URL"]}` : "")).replace(/\/$/, "");
  const supabaseUrl = env["SUPABASE_URL"] ?? env["VITE_SUPABASE_URL"] ?? "";
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (env["INFINITEPAY_ENABLED"] !== "true" || !apiKey.startsWith("inchk_") || !handle || !/^https:\/\//i.test(appBaseUrl) || !supabaseUrl || !serviceRoleKey) return null;
  return { apiKey, handle, appBaseUrl, supabaseUrl, serviceRoleKey };
}
