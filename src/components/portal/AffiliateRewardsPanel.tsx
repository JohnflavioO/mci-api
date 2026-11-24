import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, PackageCheck, Trophy } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { REDEMPTION_STATUS } from "@/lib/affiliateRewards";

type RewardsData = {
  points: { performance: number; reward: number };
  settings: { performance_points_per_real: number; reward_points_per_real: number; reward_points_enabled: boolean; grace_days: number };
  catalog: Array<{ id: string; name: string; description: string | null; points_cost: number; stock_quantity: number | null; image_url: string | null }>;
  redemptions: Array<{ id: string; points_cost: number; status: string; created_at: string; delivered_at: string | null; admin_note: string | null; affiliate_reward_catalog: { name: string } | { name: string }[] | null }>;
  ledger: Array<{ id: string; points_type: "performance" | "reward"; points_delta: number; event_type: string; description: string; created_at: string }>;
};

async function call<T>(method: "GET" | "POST", body?: unknown): Promise<T> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch("/api/affiliate/rewards", {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result;
}

const pts = (n: number) => `${Number(n).toLocaleString("pt-BR")} pts`;
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
const rewardName = (r: RewardsData["redemptions"][number]) => (Array.isArray(r.affiliate_reward_catalog) ? r.affiliate_reward_catalog[0] : r.affiliate_reward_catalog)?.name ?? "Recompensa";

export function AffiliateRewardsPanel() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["affiliate", "rewards"], queryFn: () => call<RewardsData>("GET"), retry: false, staleTime: 0, refetchOnWindowFocus: true });
  const redeem = useMutation({
    mutationFn: (rewardId: string) => call("POST", { reward_id: rewardId }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["affiliate", "rewards"] }), qc.invalidateQueries({ queryKey: ["affiliate", "dashboard"] })]);
      toast.success("Resgate solicitado. A loja vai analisar e combinar a entrega com você.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isPending) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando seus pontos…</div>;
  if (query.isError) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><p className="font-semibold">Não foi possível carregar suas recompensas.</p><p className="mt-2">{query.error.message}</p><button type="button" onClick={() => void query.refetch()} className="mt-4 rounded-md border border-amber-400 px-3 py-2 font-medium">Tentar novamente</button></div>;

  const d = query.data;
  return <div className="space-y-5">
    <section className="grid gap-3 md:grid-cols-2">
      <article className="rounded-xl border border-orange-200 bg-orange-50/60 p-5">
        <div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Pontos de recompensa</p><Gift className="size-4 text-orange-600" /></div>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{pts(d.points.reward)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{d.settings.reward_points_enabled ? `Para trocar por recompensas. Você ganha ${Number(d.settings.reward_points_per_real).toLocaleString("pt-BR")} pt por R$ 1,00 vendido, liberados ${d.settings.grace_days} dias após o pagamento.` : "O acúmulo de novos pontos de recompensa está pausado. Seu saldo continua valendo."}</p>
      </article>
      <article className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Pontos de desempenho</p><Trophy className="size-4 text-muted-foreground" /></div>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{pts(d.points.performance)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Medem seu resultado para metas e campanhas. Entram quando a venda é paga e não são trocados por recompensas.</p>
      </article>
    </section>

    <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Catálogo de recompensas</h3><p className="mt-1 text-sm text-muted-foreground">Os pontos ficam reservados no pedido de resgate e voltam se a loja recusar.</p></div>
      {d.catalog.length ? <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">{d.catalog.map((r) => {
        const missing = Math.max(0, r.points_cost - d.points.reward);
        const soldOut = r.stock_quantity != null && r.stock_quantity <= 0;
        return <article key={r.id} className="flex flex-col overflow-hidden rounded-xl border">
          {r.image_url ? <img src={r.image_url} alt="" className="h-36 w-full bg-white object-contain p-3" loading="lazy" /> : <div className="grid h-36 place-items-center bg-secondary/50"><Gift className="size-8 text-muted-foreground/60" /></div>}
          <div className="flex flex-1 flex-col p-4">
            <h4 className="font-semibold">{r.name}</h4>
            {r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}
            <p className="mt-3 text-lg font-semibold tabular-nums">{pts(r.points_cost)}</p>
            <p className="text-xs text-muted-foreground">{soldOut ? "Esgotado" : r.stock_quantity != null ? `${r.stock_quantity} disponíveis` : "Disponível"}</p>
            <div className="mt-auto pt-4">
              <button type="button" disabled={missing > 0 || soldOut || redeem.isPending} onClick={() => { if (window.confirm(`Resgatar "${r.name}" por ${pts(r.points_cost)}?`)) redeem.mutate(r.id); }} className="h-10 w-full rounded-md bg-[#ff681f] px-4 text-sm font-semibold text-white hover:bg-[#ff681f]/90 disabled:opacity-50">{soldOut ? "Esgotado" : missing > 0 ? `Faltam ${pts(missing)}` : "Resgatar"}</button>
            </div>
          </div>
        </article>;
      })}</div> : <div className="p-8 text-center text-sm text-muted-foreground">A loja ainda não cadastrou recompensas. Seus pontos continuam acumulando.</div>}
    </section>

    <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Meus resgates</h3></div>
      {d.redemptions.length ? <ul className="divide-y">{d.redemptions.map((r) => { const [label, cls] = REDEMPTION_STATUS[r.status] ?? [r.status, "bg-secondary"]; return <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
        <span className="flex items-center gap-2"><PackageCheck className="size-4 text-muted-foreground" /><span><span className="font-medium">{rewardName(r)}</span> · {pts(r.points_cost)} · {date(r.created_at)}{r.admin_note && <span className="block text-xs text-muted-foreground">{r.admin_note}</span>}</span></span>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span>
      </li>; })}</ul> : <div className="p-8 text-center text-sm text-muted-foreground">Você ainda não resgatou recompensas.</div>}
    </section>

    <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Extrato de pontos</h3><p className="mt-1 text-sm text-muted-foreground">Últimos 50 lançamentos.</p></div>
      {d.ledger.length ? <ul className="divide-y">{d.ledger.map((e) => <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
        <span>{date(e.created_at)} · {e.description} <span className="text-xs text-muted-foreground">({e.points_type === "reward" ? "recompensa" : "desempenho"})</span></span>
        <span className={`font-semibold tabular-nums ${e.points_delta < 0 ? "text-rose-700" : "text-emerald-700"}`}>{e.points_delta > 0 ? "+" : ""}{pts(e.points_delta)}</span>
      </li>)}</ul> : <div className="p-8 text-center text-sm text-muted-foreground">Seus pontos aparecem aqui quando a primeira venda indicada for paga.</div>}
    </section>
  </div>;
}
