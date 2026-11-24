import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock3, Coins, Landmark, ShoppingBag, Users } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { LOYALTY_NAME, type LoyaltySettings } from "@/lib/loyalty";

type Stats = { customers: number; issued: number; redeemed: number; expired: number; available: number; pending: number; liability: number };
type Data = { settings: LoyaltySettings & { updated_at: string }; stats: Stats };

async function call<T>(method: "GET" | "PUT", body?: unknown): Promise<T> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
  const response = await fetch("/api/admin/loyalty", {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result;
}
const pts = (n: number) => `${Number(n ?? 0).toLocaleString("pt-BR")} pts`;
const money = (n: number) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const field = "mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm";

export function AdminLoyaltySection() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "loyalty"], queryFn: () => call<Data>("GET"), retry: false, staleTime: 15_000 });
  const [form, setForm] = useState<Record<keyof LoyaltySettings, string | boolean> | null>(null);
  useEffect(() => {
    const s = query.data?.settings;
    if (s) setForm({ enabled: s.enabled, points_per_real: String(s.points_per_real), real_per_100_points: String(s.real_per_100_points), max_redeem_pct: String(s.max_redeem_pct), min_redeem_points: String(s.min_redeem_points), grace_days: String(s.grace_days), expiry_months: String(s.expiry_months) });
  }, [query.data?.settings]);
  const save = useMutation({
    mutationFn: () => call("PUT", form),
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["admin", "loyalty"] }), qc.invalidateQueries({ queryKey: ["loyalty"] })]); toast.success("Regras do programa salvas."); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isPending) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando {LOYALTY_NAME}…</div>;
  if (query.isError) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><p className="font-semibold">Não foi possível carregar o programa.</p><p className="mt-2">{query.error.message}</p></div>;
  const st = query.data.stats;
  const num = (k: keyof LoyaltySettings) => String(form?.[k] ?? "");
  const set = (k: keyof LoyaltySettings, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const perReal = Number(String(form?.points_per_real ?? "0").replace(",", ".")) || 0;
  const per100 = Number(String(form?.real_per_100_points ?? "0").replace(",", ".")) || 0;
  const cashbackPct = Math.round(perReal * per100 * 100) / 100;

  return <div className="space-y-6">
    <section className="rounded-2xl bg-[#171a1f] p-6 text-white sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#ff8a50]">Fidelidade do cliente final</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{LOYALTY_NAME}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">O cliente ganha pontos em cada compra paga e usa como desconto no checkout. Revendedores não participam. Os pontos são liberados após o prazo de arrependimento, vencem por lote e voltam se o pedido em que foram usados for cancelado.</p>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Clientes com pontos", value: st.customers.toLocaleString("pt-BR"), detail: "Já ganharam pontos em compras", icon: Users },
        { label: "Saldo dos clientes", value: money(st.liability), detail: `${pts(st.available)} disponíveis + ${pts(st.pending)} em liberação`, icon: Landmark },
        { label: "Pontos usados", value: pts(st.redeemed), detail: `Emitidos: ${pts(st.issued)}`, icon: ShoppingBag },
        { label: "Pontos vencidos", value: pts(st.expired), detail: "Saíram do saldo por validade", icon: CalendarClock },
      ].map(({ label, value, detail, icon: Icon }) => <article key={label} className="rounded-xl border bg-card p-5"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><Icon className="size-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}
    </section>

    {form && <form className="rounded-xl border bg-card" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="border-b p-5"><h3 className="font-semibold">Regras do programa</h3><p className="mt-1 text-sm text-muted-foreground">Mudanças valem para as próximas compras e resgates. Lotes já criados mantêm a liberação e o vencimento que tinham.</p></div>
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm md:col-span-2 xl:col-span-3"><span><span className="font-medium">Programa ativo</span><span className="block text-xs text-muted-foreground">Pausado: ninguém ganha nem usa pontos, e o saldo fica guardado.</span></span><input type="checkbox" checked={form.enabled === true} onChange={(e) => set("enabled", e.target.checked)} className="size-4 accent-orange-600" /></label>
        <label className="text-sm font-medium">Pontos por R$ 1,00 em produtos<input value={num("points_per_real")} onChange={(e) => set("points_per_real", e.target.value)} inputMode="decimal" className={field} /></label>
        <label className="text-sm font-medium">Valor de 100 pontos (R$)<input value={num("real_per_100_points")} onChange={(e) => set("real_per_100_points", e.target.value)} inputMode="decimal" className={field} /></label>
        <label className="text-sm font-medium">Limite de uso por pedido (% dos produtos)<input value={num("max_redeem_pct")} onChange={(e) => set("max_redeem_pct", e.target.value)} inputMode="decimal" className={field} /></label>
        <label className="text-sm font-medium">Mínimo de pontos por resgate<input value={num("min_redeem_points")} onChange={(e) => set("min_redeem_points", e.target.value)} inputMode="numeric" className={field} /></label>
        <label className="text-sm font-medium">Prazo de liberação (dias)<input value={num("grace_days")} onChange={(e) => set("grace_days", e.target.value)} inputMode="numeric" className={field} /></label>
        <label className="text-sm font-medium">Validade dos pontos (meses)<input value={num("expiry_months")} onChange={(e) => set("expiry_months", e.target.value)} inputMode="numeric" className={field} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Coins className="size-4 text-brand" />Retorno ao cliente: <strong className="text-foreground">{cashbackPct.toLocaleString("pt-BR")}%</strong> do valor dos produtos em pontos <Clock3 className="ml-2 size-4" />liberados em {num("grace_days")} dias</p>
        <button type="submit" disabled={save.isPending} className="h-10 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? "Salvando…" : "Salvar regras"}</button>
      </div>
    </form>}
  </div>;
}
