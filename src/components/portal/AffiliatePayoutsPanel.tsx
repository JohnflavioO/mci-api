import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, KeyRound, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { normalizePixKey } from "@/lib/pixKey";

type PayoutsData = {
  balance: { withdrawable: number; available: number; adjustments: number; pending: number; inPayout: number; paid: number };
  pixKey: string | null;
  status: string | null;
  minWithdrawal: number;
  graceDays: number;
  payouts: Array<{ id: string; amount: number; pix_key: string; status: "requested" | "paid" | "rejected"; requested_at: string; reviewed_at: string | null; payment_reference: string | null; rejection_reason: string | null }>;
  adjustments: Array<{ id: string; amount: number; reason: string; created_at: string; payout_id: string | null }>;
};

async function call<T>(method: "GET" | "PATCH" | "POST", body?: unknown): Promise<T> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch("/api/affiliate/payouts", {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result;
}

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
const STATUS = { requested: ["Em análise", "bg-amber-50 text-amber-800"], paid: ["Pago", "bg-emerald-50 text-emerald-700"], rejected: ["Recusado", "bg-rose-50 text-rose-700"] } as const;

export function AffiliatePayoutsPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["affiliate", "payouts"], queryFn: () => call<PayoutsData>("GET"), retry: false, staleTime: 0, refetchOnWindowFocus: true });
  const [pixDraft, setPixDraft] = useState("");
  useEffect(() => { setPixDraft(query.data?.pixKey ?? ""); }, [query.data?.pixKey]);
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["affiliate", "payouts"] }),
    queryClient.invalidateQueries({ queryKey: ["affiliate", "dashboard"] }),
  ]);
  const savePix = useMutation({
    mutationFn: (pix_key: string) => call<{ pixKey: string }>("PATCH", { pix_key }),
    onSuccess: async () => { await refresh(); toast.success("Chave Pix salva."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const requestPayout = useMutation({
    mutationFn: () => call<{ payout: { amount: number } }>("POST", {}),
    onSuccess: async (result) => { await refresh(); toast.success(`Saque de ${money(result.payout.amount)} solicitado. Você será avisado quando o Pix for enviado.`); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isPending) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando seu saldo…</div>;
  if (query.isError) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><p className="font-semibold">Não foi possível carregar seus pagamentos.</p><p className="mt-2">{query.error.message}</p><button type="button" onClick={() => void query.refetch()} className="mt-4 rounded-md border border-amber-400 px-3 py-2 font-medium">Tentar novamente</button></div>;

  const d = query.data;
  const b = d.balance;
  const pixCheck = pixDraft.trim() ? normalizePixKey(pixDraft) : null;
  const pixChanged = pixDraft.trim() !== (d.pixKey ?? "");
  const blocker = d.status !== "active" ? "Seu cadastro de afiliado está suspenso."
    : !d.pixKey ? "Cadastre sua chave Pix para pedir o saque."
    : b.inPayout > 0 ? "Você já tem um saque em análise."
    : b.withdrawable <= 0 || b.withdrawable < d.minWithdrawal ? `O saque mínimo é ${money(d.minWithdrawal)}. Faltam ${money(Math.max(0, d.minWithdrawal - b.withdrawable))}.`
    : null;

  const cards = [
    { label: "Disponível para saque", value: money(b.withdrawable), detail: b.adjustments < 0 ? `Já descontados ${money(-b.adjustments)} de estornos.` : `Saque mínimo: ${money(d.minWithdrawal)}`, icon: Wallet, strong: true },
    { label: "Em liberação", value: money(b.pending), detail: `Liberado ${d.graceDays} dias após o pagamento do pedido, se não houver estorno.`, icon: Clock3 },
    { label: "Saque em análise", value: money(b.inPayout), detail: "Pedido enviado à loja, aguardando o Pix.", icon: Send },
    { label: "Total já recebido", value: money(b.paid), detail: "Soma dos saques pagos.", icon: CheckCircle2 },
  ];

  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, detail, icon: Icon, strong }) => <article key={label} className={`rounded-xl border p-5 ${strong ? "border-orange-200 bg-orange-50/60" : "bg-card"}`}><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><Icon className="size-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2"><KeyRound className="size-4 text-orange-600" /><h3 className="font-semibold">Chave Pix para receber</h3></div>
        <p className="mt-1 text-sm text-muted-foreground">CPF, CNPJ, e-mail, celular ou chave aleatória. Use uma chave no seu nome: a loja confere a titularidade antes de pagar.</p>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (pixCheck?.ok) savePix.mutate(pixDraft.trim()); }}>
          <input value={pixDraft} onChange={(event) => setPixDraft(event.target.value)} placeholder="Sua chave Pix" aria-label="Chave Pix" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
          <button type="submit" disabled={!pixChanged || !pixCheck?.ok || savePix.isPending} className="h-10 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50">{savePix.isPending ? "Salvando…" : d.pixKey ? "Trocar chave" : "Salvar chave"}</button>
        </form>
        {pixChanged && pixCheck && !pixCheck.ok && <p className="mt-2 text-xs text-rose-700">{pixCheck.error}</p>}
        {b.inPayout > 0 && pixChanged && <p className="mt-2 text-xs text-muted-foreground">O saque em análise continua usando a chave informada no pedido.</p>}
      </article>

      <article className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2"><Send className="size-4 text-orange-600" /><h3 className="font-semibold">Pedir saque</h3></div>
        <p className="mt-1 text-sm text-muted-foreground">O saque inclui todo o saldo disponível. A loja envia o Pix manualmente e registra o comprovante aqui.</p>
        <p className="mt-4 text-3xl font-semibold tabular-nums">{money(Math.max(0, b.withdrawable))}</p>
        <button type="button" disabled={!!blocker || requestPayout.isPending} onClick={() => { if (window.confirm(`Pedir saque de ${money(b.withdrawable)} para a chave Pix ${d.pixKey}?`)) requestPayout.mutate(); }} className="mt-4 h-11 w-full rounded-md bg-[#ff681f] px-4 text-sm font-semibold text-white hover:bg-[#ff681f]/90 disabled:opacity-50">{requestPayout.isPending ? "Enviando…" : "Pedir saque"}</button>
        {blocker && <p className="mt-2 text-xs text-muted-foreground">{blocker}</p>}
      </article>
    </section>

    <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Histórico de saques</h3><p className="mt-1 text-sm text-muted-foreground">Pedidos de saque, Pix recebidos e recusas.</p></div>
      {d.payouts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Pedido em</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Chave Pix</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3">Detalhe</th></tr></thead><tbody className="divide-y">{d.payouts.map((p) => { const [label, cls] = STATUS[p.status]; return <tr key={p.id}><td className="px-5 py-3">{date(p.requested_at)}</td><td className="px-5 py-3 font-semibold tabular-nums">{money(p.amount)}</td><td className="px-5 py-3 font-mono text-xs">{p.pix_key}</td><td className="px-5 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span></td><td className="px-5 py-3 text-muted-foreground">{p.status === "paid" ? `Pago em ${p.reviewed_at ? date(p.reviewed_at) : "—"} · Ref. ${p.payment_reference}` : p.status === "rejected" ? p.rejection_reason : "Aguardando a loja"}</td></tr>; })}</tbody></table></div> : <div className="p-8 text-center text-sm text-muted-foreground">Você ainda não pediu saques.</div>}
    </section>

    {d.adjustments.length > 0 && <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Ajustes de saldo</h3><p className="mt-1 text-sm text-muted-foreground">Estornos de pedidos cuja comissão já tinha entrado num saque. O valor é descontado do próximo saque.</p></div>
      <ul className="divide-y">{d.adjustments.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span>{date(a.created_at)} · {a.reason}</span><span className={`font-semibold tabular-nums ${a.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(a.amount)}</span></li>)}</ul>
    </section>}
  </div>;
}
