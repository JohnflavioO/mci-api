import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;

export const isSupabaseConfigured = () => Boolean(url && key);

let client: SupabaseClient | null = null;

/** Cliente Supabase próprio (chave pública). Criado sob demanda; sessão só no navegador. */
export function getSupabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase não configurado");
  client ??= createClient(url, key, {
    auth: {
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
    },
  });
  return client;
}
