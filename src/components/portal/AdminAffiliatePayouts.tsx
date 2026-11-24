import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Copy, RefreshCw, Send, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";

type Payout = {
  id: string; affiliate_user_id: string; amount: number; pix_key: string; status: "requested" | "paid" | "rejected";
  requested_at: string; reviewed_at: string | null; payment_reference: string | null; rejection_reason: string | null;
  email: string | null; affiliate_profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};
type PayoutsData = { payouts: Payout[]; totals: { requested: number; requestedCount: number; pending: number; available: number } };

async function call<T>(method: "GET" | "POST", body?: unknown): Promise<T> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
  const response = await fetch("/api/admin/affiliate-payouts", {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result;
}

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const nameOf = (p: Payout) => (Array.isArray(p.affiliate_profiles) ? p.affiliate_profiles[0] : p.affiliate_profiles)?.display_name || p.email || p.affiliate_user_id.slice(0, 8);
const STATUS = { requested: ["A pagar", "bg-amber-50 text-amber-800"], paid: ["Pago", "bg-emerald-50 text-emerald-700"], rejected: ["Recusado", "bg-rose-50 text-rose-700"] } as const;

export function AdminAffiliatePayouts() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"requested" | "all">("requested");
  const query = useQuery({ queryKey: ["admin", "affiliates", "payouts"], queryFn: () => call<PayoutsData>("GET"), retry: false, staleTime: 15_000 });
  const action = useMutation({
    mutationFn: (body: { action: "pay" | "reject"; payout_id: string; reference?: string; reason?: string }) => call("POST", body),
    onSuccess: async (_data, body) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "affiliates", "payouts"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "affiliates", "program"] }),
      ]);
      toast.success(body.action === "pay" ? "Pagamento registrado." : "Saque recusado. O saldo voltou para o afiliado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pay = (p: Payout) => {
    const reference = window.prompt(`Pix de ${money(p.amount)} para ${nameOf(p)} (chave ${p.pix_key}).\n\nDepois de enviar o Pix pelo banco, cole aqui o ID da transação (E2E) ou outra referência do comprovante:`);
    if (reference?.trim()) action.mutate({ action: "pay", payout_id: p.id, reference: reference.trim() });
  };
  const reject = (p: Payout) => {
    const reason = window.prompt(`Recusar o saque de ${money(p.amount)} de ${nameOf(p)}?\n\nO valor volta para o saldo do afiliado. Informe o motivo (ele verá esta mensagem):`);
    if (reason?.trim()) action.mutate({ action: "reject", payout_id: p.id, reason: reason.trim() });
  };

  const rows = (query.data?.payouts ?? []).filter((p) => filter === "all" || p.status === "requested");
  const t = query.data?.totals;

  return <div className="space-y-4">
    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Saques a pagar", value: t ? `${money(t.requested)}` : "—", detail: t ? `${t.requestedCount} pedido(s) aguardando o Pix` : "", icon: Send },
        { label: "Em liberação", value: t ? money(t.pending) : "—", detail: "Comissões dentro do prazo de carência", icon: Clock3 },
        { label: "Disponível, sem pedido", value: t ? money(t.available) : "—", detail: "Liberado, ainda não solicitado pelos afiliados", icon: Wallet },
      ].map(({ label, value, detail, icon: Icon }) => <article key={label} className="rounded-xl border bg-card p-5"><Icon className="size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}
    </section>

    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="font-semibold">Pedidos de saque</h3><p className="mt-1 text-sm text-muted-foreground">Envie o Pix pelo banco, confira se a chave é do afiliado e registre a referência do comprovante.</p></div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(event) => setFilter(event.target.value as "requested" | "all")} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="requested">A pagar</option><option value="all">Todos</option></select>
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"><RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar</button>
        </div>
      </div>
      {query.isError ? <div className="p-6 text-sm text-destructive">{query.error.message}</div> : query.isPending ? <div className="p-6 text-sm text-muted-foreground">Carregando saques…</div> : rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Pedido em</th><th className="px-5 py-3 font-medium">Afiliado</th><th className="px-5 py-3 font-medium">Valor</th><th className="px-5 py-3 font-medium">Chave Pix</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 text-right font-medium">Ações</th></tr></thead><tbody className="divide-y">{rows.map((p) => { const [label, cls] = STATUS[p.status]; return <tr key={p.id} className="align-top hover:bg-secondary/30">
        <td className="px-5 py-4 text-muted-foreground">{dateTime(p.requested_at)}</td>
        <td className="px-5 py-4"><p className="font-medium">{nameOf(p)}</p>{p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}</td>
        <td className="px-5 py-4 font-semibold tabular-nums">{money(p.amount)}</td>
        <td className="px-5 py-4"><button type="button" onClick={() => void navigator.clipboard.writeText(p.pix_key).then(() => toast.success("Chave Pix copiada."), () => toast.error("Não foi possível copiar."))} className="inline-flex items-center gap-1.5 font-mono text-xs text-orange-700 underline underline-offset-4"><Copy className="size-3.5" />{p.pix_key}</button></td>
        <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span>{p.status === "paid" && <p className="mt-1 text-xs text-muted-foreground">Ref. {p.payment_reference}</p>}{p.status === "rejected" && <p className="mt-1 text-xs text-muted-foreground">{p.rejection_reason}</p>}</td>
        <td className="px-5 py-4 text-right">{p.status === "requested" ? <div className="inline-flex gap-2"><button type="button" disabled={action.isPending} onClick={() => pay(p)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#171a1f] px-3 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 className="size-3.5" />Marcar como pago</button><button type="button" disabled={action.isPending} onClick={() => reject(p)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rose-200 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"><XCircle className="size-3.5" />Recusar</button></div> : <span className="text-xs text-muted-foreground">{p.reviewed_at ? dateTime(p.reviewed_at) : "—"}</span>}</td>
      </tr>; })}</tbody></table></div> : <div className="p-10 text-center text-sm text-muted-foreground">{filter === "requested" ? "Nenhum saque aguardando pagamento." : "Nenhum saque registrado ainda."}</div>}
    </section>

    <section className="rounded-xl border bg-card p-5 text-sm text-muted-foreground"><h3 className="font-semibold text-foreground">Como funciona</h3><p className="mt-2">A comissão nasce pendente quando o pedido indicado é pago e fica disponível depois do prazo de carência. Se o pedido for estornado antes disso, a comissão é anulada. Se o estorno vier depois de a comissão entrar num saque, o valor é descontado automaticamente do próximo saque do afiliado.</p></section>
  </div>;
}
