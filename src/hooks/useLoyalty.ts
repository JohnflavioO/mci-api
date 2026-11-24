import { useQuery } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { LoyaltySettings } from "@/lib/loyalty";

export type LoyaltyData = {
  settings: LoyaltySettings | null;
  signedIn: boolean;
  eligible?: boolean;
  balance?: { available: number; pending: number; expiring30d: number; nextExpiry: string | null };
  redeem?: { maxPoints: number; maxDiscount: number };
  ledger?: Array<{ id: string; kind: string; points: number; description: string; created_at: string; available_at: string | null; expires_at: string | null; remaining: number | null }>;
};

/** Store House Pontos: regras públicas, saldo e (com subtotal) quanto dá para usar no checkout. */
export function useLoyalty(subtotal?: number | null) {
  const amount = subtotal != null && Number.isFinite(subtotal) && subtotal > 0 ? Math.round(subtotal * 100) / 100 : 0;
  return useQuery({
    queryKey: ["loyalty", amount],
    enabled: isSupabaseConfigured(),
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<LoyaltyData> => {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      const response = await fetch(`/api/loyalty${amount ? `?subtotal=${amount}` : ""}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      const body = await response.json().catch(() => ({})) as LoyaltyData & { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar o Store House Pontos.");
      return body;
    },
  });
}
