import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Download, RefreshCw, Search } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { commissionStage, STAGE_LABEL, toCsv, type CommissionStage } from "@/lib/commissionReport";

type Row = {
  id: string; affiliate_user_id: string; order_id: string; order_total: number; commission_rate: number; commission_amount: number;
  status: string; created_at: string; available_at: string | null; paid_at: string | null; payment_reference: string | null;
  payout_id: string | null; reversed_at: string | null; reversal_reason: string | null;
  affiliate_profiles: { display_name: string | null; referral_code: string } | { display_name: string | null; referral_code: string }[] | null;
  affiliate_payouts: { status: string } | { status: string }[] | null;
};
type Data = { commissions: Row[]; graceDays: number };
type Period = "30" | "90" | "365" | "all";

const first = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
const money = (n: number) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (v: string | null) => (v ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(v)) : "—");
const orderCode = (id: string) => id.slice(0, 8).toUpperCase();

async function load(period: Period): Promise<Data> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
  const response = await fetch(`/api/admin/affiliate-commissions${period === "all" ? "" : `?days=${period}`}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
  const body = await response.json().catch(() => ({})) as Data & { error?: string };
  if (!response.ok) throw new Error(body.error || "Não foi possível carregar o relatório.");
  return body;
}

export function AdminCommissionsReport() {
  const [period, setPeriod] = useState<Period>("90");
  const [stage, setStage] = useState<CommissionStage | "all">("all");
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["admin", "commissions-report", period], queryFn: () => load(period), retry: false, staleTime: 15_000 });

  const rows = useMemo(() => (query.data?.commissions ?? []).map((r) => {
    const profile = first(r.affiliate_profiles);
    const s = commissionStage({ status: r.status, payout_id: r.payout_id, reversed_at: r.reversed_at, payout_status: first(r.affiliate_payouts)?.status ?? null });
    const releaseAt = r.available_at ?? new Date(new Date(r.created_at).getTime() + (query.data?.graceDays ?? 7) * 86400000).toISOString();
    return { ...r, stage: s, affiliate: profile?.display_name || profile?.referral_code || r.affiliate_user_id.slice(0, 8), releaseAt };
  }), [query.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((r) => (stage === "all" || r.stage === stage) && (!term || r.affiliate.toLocaleLowerCase("pt-BR").includes(term) || orderCode(r.order_id).toLocaleLowerCase("pt-BR").includes(term)));
  }, [rows, stage, search]);

  const totals = useMemo(() => {
    const t = { pending: 0, available: 0, in_payout: 0, paid: 0, reversed: 0, base: 0 };
    for (const r of filtered) {
      const v = Number(r.commission_amount);
      if (r.stage === "pending") t.pending += v;
      else if (r.stage === "available") t.available += v;
      else if (r.stage === "in_payout") t.in_payout += v;
      else if (r.stage === "paid") t.paid += v;
      else if (r.stage === "reversed" || r.stage === "reversed_after_payout") t.reversed += v;
      if (r.stage !== "reversed" && r.stage !== "cancelled") t.base += Number(r.order_total);
    }
    return t;
  }, [filtered]);

  const exportCsv = () => {
    const csv = toCsv(
      ["Data do pagamento", "Pedido", "Afiliado", "Base da comissão", "Taxa (%)", "Comissão", "Situação", "Liberação", "Pago em", "Referência do Pix", "Estorno"],
      filtered.map((r) => [date(r.created_at), orderCode(r.order_id), r.affiliate, Number(r.order_total), Number(r.commission_rate), Number(r.commission_amount), STAGE_LABEL[r.stage][0], date(r.releaseAt), date(r.paid_at), r.payment_reference ?? "", r.reversal_reason ?? ""]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `comissoes-afiliados-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        { label: "Em liberação", value: totals.pending, detail: `Pedidos pagos há menos de ${query.data?.graceDays ?? 7} dias` },
        { label: "Disponível", value: totals.available, detail: "Liberado, aguardando pedido de saque" },
        { label: "Em saque", value: totals.in_payout, detail: "Pedido de saque aguardando o Pix" },
        { label: "Pago", value: totals.paid, detail: "Pix registrado" },
        { label: "Estornado", value: totals.reversed, detail: "Pedidos estornados ou contestados" },
      ].map((c) => <article key={c.label} className="rounded-xl border bg-card p-5"><p className="text-sm font-medium text-muted-foreground">{c.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{query.data ? money(c.value) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">{c.detail}</p></article>)}
    </section>

    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-center">
        <label className="relative block flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar afiliado ou pedido…" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" /></label>
        <select value={stage} onChange={(e) => setStage(e.target.value as CommissionStage | "all")} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Situação">
          <option value="all">Todas as situações</option>
          {(Object.keys(STAGE_LABEL) as CommissionStage[]).map((k) => <option key={k} value={k}>{STAGE_LABEL[k][0]}</option>)}
        </select>
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Período">
          <option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Últimos 12 meses</option><option value="all">Tudo</option>
        </select>
        <div className="flex gap-2">
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"><RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />Atualizar</button>
          <button type="button" onClick={exportCsv} disabled={!filtered.length} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#171a1f] px-3 text-sm font-semibold text-white disabled:opacity-50"><Download className="size-4" />Exportar CSV</button>
        </div>
      </div>
      {query.isError ? <div className="p-6 text-sm text-destructive">{query.error.message}</div>
        : query.isPending ? <div className="p-6 text-sm text-muted-foreground">Carregando comissões…</div>
        : filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Pago em</th><th className="px-5 py-3 font-medium">Pedido</th><th className="px-5 py-3 font-medium">Afiliado</th><th className="px-5 py-3 text-right font-medium">Base</th><th className="px-5 py-3 text-right font-medium">Taxa</th><th className="px-5 py-3 text-right font-medium">Comissão</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 font-medium">Detalhe</th></tr></thead>
          <tbody className="divide-y">{filtered.map((r) => { const [label, cls] = STAGE_LABEL[r.stage]; return <tr key={r.id} className="hover:bg-secondary/30">
            <td className="px-5 py-3 text-muted-foreground">{date(r.created_at)}</td>
            <td className="px-5 py-3 font-mono text-xs">{orderCode(r.order_id)}</td>
            <td className="px-5 py-3 font-medium">{r.affiliate}</td>
            <td className="px-5 py-3 text-right tabular-nums">{money(r.order_total)}</td>
            <td className="px-5 py-3 text-right tabular-nums">{Number(r.commission_rate).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
            <td className="px-5 py-3 text-right font-semibold tabular-nums">{money(r.commission_amount)}</td>
            <td className="px-5 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span></td>
            <td className="px-5 py-3 text-xs text-muted-foreground">{r.stage === "pending" ? `Libera em ${date(r.releaseAt)}` : r.stage === "paid" ? `Pago em ${date(r.paid_at)}${r.payment_reference ? ` · Ref. ${r.payment_reference}` : ""}` : r.stage === "reversed_after_payout" ? "Descontada do próximo saque" : r.reversal_reason ?? ""}</td>
          </tr>; })}</tbody>
          <tfoot className="border-t bg-secondary/40 text-sm font-semibold"><tr><td className="px-5 py-3" colSpan={3}>{filtered.length} comissão(ões)</td><td className="px-5 py-3 text-right tabular-nums">{money(totals.base)}</td><td /><td className="px-5 py-3 text-right tabular-nums">{money(totals.pending + totals.available + totals.in_payout + totals.paid)}</td><td colSpan={2} className="px-5 py-3 text-xs font-normal text-muted-foreground">Total válido (sem estornos)</td></tr></tfoot>
        </table></div>
        : <div className="p-10 text-center text-sm text-muted-foreground">{rows.length ? "Nenhuma comissão com esses filtros." : "Nenhuma comissão neste período. Elas aparecem quando uma venda indicada por afiliado é paga."}</div>}
    </section>

    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">Para pagar os afiliados (Pix) e mudar as regras de comissão, use a área de Afiliados.</p>
      <Link to="/admin/$secao" params={{ secao: "afiliados" }} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-4 text-sm font-semibold hover:bg-secondary">Ir para Afiliados<ArrowRight className="size-4" /></Link>
    </section>
  </div>;
}
