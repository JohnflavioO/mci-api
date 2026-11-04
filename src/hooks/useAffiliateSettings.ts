import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";

export type AffiliateSettings = {
  attribution_window_days: number;
  attribution_model: "last_click";
  default_commission_pct: number;
  commission_base: "net";
  grace_days: number;
  min_withdrawal: number;
  block_self_referral: boolean;
  stack_with_coupon: boolean;
  stack_with_volume_discount: boolean;
  stack_with_reseller: boolean;
  stacked_commission_pct: number;
  updated_by: string | null;
  updated_at: string;
  enabled: boolean;
  performance_points_per_real: number;
  reward_points_per_real: number;
  reward_points_enabled: boolean;
};

async function token() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
  return data.session.access_token;
}

export async function fetchAffiliateSettings(): Promise<AffiliateSettings> {
  const accessToken = await token();
  const response = await fetch("/api/affiliate/settings", { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({})) as { settings?: AffiliateSettings; error?: string };
  if (!response.ok || !body.settings) throw new Error(body.error || "Não foi possível carregar as regras de afiliados.");
  return body.settings;
}

export async function saveAffiliateSettings(settings: Partial<AffiliateSettings>) {
  const accessToken = await token();
  const response = await fetch("/api/affiliate/settings", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Não foi possível salvar as regras.");
}

export function useAffiliateSettings() {
  return useQuery({
    queryKey: ["affiliate_settings"],
    queryFn: fetchAffiliateSettings,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
