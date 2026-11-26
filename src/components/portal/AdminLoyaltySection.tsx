import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CalendarClock, Clock3, Coins, Download, Landmark, ListChecks, Search, Settings2, ShoppingBag, ShoppingCart, Users, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { discountForPoints, parseLoyaltySettings, LEDGER_LABEL, LOYALTY_NAME, pointsForAmount, type LoyaltySettings } from "@/lib/loyalty";
import { toCsv } from "@/lib/commissionReport";

type Stats = { customers: number; issued: number; redeemed: number; expired: number; available: number; pending: number; liability: number };
type Overview = { settings: LoyaltySettings & { updated_at: string }; stats: Stats };
type Customer = { user_id: string; email: string; full_name: string | null; available: number; pending: number; expiring_30d: number; earned: number; redeemed: number; expired: number; adjusted: number; last_activity: string | null; next_expiry: string | null };
type Entry = { id: string; user_id: string; kind: string; points: number; order_id: string | null; description: string; available_at: string | null; expires_at: string | null; remaining: number | null; created_by: string | null; created_at: string; customer?: string; by_admin?: string | null };
type Tab = "overview" | "customers" | "transactions" | "rules";

async function api<T>(method: "GET" | "PUT" | "POST", query = "", body?: unknown): Promise<T> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
  const response = await fetch(`/api/admin/loyalty${query}`, {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result;
}
const pts = (n: number) => `${Math.trunc(Number(n ?? 0)).toLocaleString("pt-BR")} pts`;
const money = (n: number) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (v: string | null) => (v ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(v)) : "—");
const dateTime = (v: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const KIND_CLASS: Record<string, string> = {
  earn: "bg-emerald-50 text-emerald-700", redeem: "bg-orange-50 text-orange-800", redeem_refund: "bg-sky-50 text-sky-800",
  reversal: "bg-rose-50 text-rose-700", expire: "bg-secondary text-muted-foreground", adjust: "bg-violet-50 text-violet-800",
};
const field = "mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm";
const Kind = ({ kind }: { kind: string }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${KIND_CLASS[kind] ?? "bg-secondary"}`}>{LEDGER_LABEL[kind] ?? kind}</span>;
const orderCode = (id: string | null) => (id ? id.slice(0, 8).toUpperCase() : "—");

export function AdminLoyaltySection() {
  const [tab, setTab] = useState<Tab>("overview");
  const overview = useQuery({ queryKey: ["admin", "loyalty"], queryFn: () => api<Overview>("GET"), retry: false, staleTime: 15_000 });
  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "overview", label: "Como funciona", icon: BookOpen },
    { id: "customers", label: "Clientes", icon: Users },
    { id: "transactions", label: "Movimentações", icon: ListChecks },
    { id: "rules", label: "Regras", icon: Settings2 },
  ];
  return <div className="space-y-6">
    <section className="rounded-2xl bg-[#171a1f] p-6 text-white sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#ff8a50]">Fidelidade do cliente final</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{LOYALTY_NAME}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Cada compra paga vira pontos, e os pontos viram desconto na próxima compra. Aqui você acompanha quem tem pontos, de onde veio cada movimento e ajusta as regras.</p>
    </section>
    <nav className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${tab === id ? "bg-[#171a1f] text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><Icon className="size-4" />{label}</button>)}
    </nav>
    {overview.isError ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><p className="font-semibold">Não foi possível carregar o programa.</p><p className="mt-2">{overview.error.message}</p></div>
      : overview.isPending ? <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando {LOYALTY_NAME}…</div>
      : tab === "overview" ? <OverviewTab data={overview.data} onOpen={setTab} />
      : tab === "customers" ? <CustomersTab settings={overview.data.settings} />
      : tab === "transactions" ? <TransactionsTab settings={overview.data.settings} />
      : <RulesTab settings={overview.data.settings} />}
  </div>;
}

function OverviewTab({ data, onOpen }: { data: Overview; onOpen: (tab: Tab) => void }) {
  const s = data.settings, st = data.stats;
  const [purchase, setPurchase] = useState("4210");
  const [next, setNext] = useState("1000");
  const value = Number(purchase.replace(/\./g, "").replace(",", ".")) || 0;
  const nextValue = Number(next.replace(/\./g, "").replace(",", ".")) || 0;
  const earned = pointsForAmount(value, s.points_per_real);
  const release = addDays(new Date(), s.grace_days);
  const expiry = addMonths(release, s.expiry_months);
  const capPoints = Math.floor(Math.floor(nextValue * s.max_redeem_pct) / s.real_per_100_points);
  const candidate = Math.min(earned, capPoints);
  const usable = candidate >= s.min_redeem_points ? candidate : 0;
  const cashback = Math.round(s.points_per_real * s.real_per_100_points * 100) / 100;

  return <div className="space-y-6">
    {!s.enabled && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">O programa está <strong>pausado</strong>: ninguém ganha nem usa pontos agora. Os saldos continuam guardados. Ative na aba Regras.</div>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Clientes com pontos", value: st.customers.toLocaleString("pt-BR"), detail: "Ver lista de clientes", icon: Users, tab: "customers" as Tab },
        { label: "Saldo dos clientes", value: money(st.liability), detail: `${pts(st.available)} disponíveis + ${pts(st.pending)} em liberação`, icon: Landmark, tab: "customers" as Tab },
        { label: "Pontos usados", value: pts(st.redeemed), detail: `De ${pts(st.issued)} emitidos · ver movimentações`, icon: ShoppingBag, tab: "transactions" as Tab },
        { label: "Pontos vencidos", value: pts(st.expired), detail: "Saíram do saldo por validade", icon: CalendarClock, tab: "transactions" as Tab },
      ].map(({ label, value, detail, icon: Icon, tab }) => <button key={label} type="button" onClick={() => onOpen(tab)} className="rounded-xl border bg-card p-5 text-left transition hover:border-brand/50"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><Icon className="size-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></button>)}
    </section>
    <p className="-mt-3 text-xs text-muted-foreground">"Saldo dos clientes" é quanto a loja deve em descontos se todos usarem os pontos (pontos × valor do ponto).</p>

    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h3 className="font-semibold">O caminho do cliente, com as regras de hoje</h3>
      <ol className="mt-4 grid gap-3 md:grid-cols-4">
        {[
          { icon: ShoppingCart, title: "1. Compra", text: `Ganha ${(s.points_per_real * 100).toLocaleString("pt-BR")} pts por R$ 100,00 em produtos. Frete não conta. Revendedor não participa.` },
          { icon: Clock3, title: "2. Liberação", text: `Os pontos ficam "em liberação" por ${s.grace_days} dias (prazo de arrependimento). Se o pedido for estornado, saem.` },
          { icon: Coins, title: "3. Usa no checkout", text: `100 pts = ${money(s.real_per_100_points)}. Mínimo de ${pts(s.min_redeem_points)} e até ${s.max_redeem_pct}% do valor dos produtos por pedido.` },
          { icon: CalendarClock, title: "4. Validade", text: `Cada lote vale ${s.expiry_months} meses após liberado. Os que vencem primeiro são usados primeiro.` },
        ].map(({ icon: Icon, title, text }) => <li key={title} className="rounded-xl bg-secondary/50 p-4"><Icon className="size-5 text-brand" /><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></li>)}
      </ol>
      <p className="mt-4 rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-950">Retorno nominal: o cliente recebe <strong>{cashback.toLocaleString("pt-BR")}% de volta</strong> em desconto para a próxima compra. Se o pedido em que usou pontos for cancelado, os pontos voltam para ele.</p>
    </section>

    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h3 className="font-semibold">Simulador</h3>
      <p className="mt-1 text-sm text-muted-foreground">Simulação das regras salvas, supondo programa ativo, saldo liberado e nenhum outro desconto. Pontos fracionários são descartados por compra.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Compra de hoje (R$, só produtos)<input value={purchase} onChange={(e) => setPurchase(e.target.value)} inputMode="decimal" className={field} /></label>
        <label className="text-sm font-medium">Próxima compra (R$, só produtos)<input value={next} onChange={(e) => setNext(e.target.value)} inputMode="decimal" className={field} /></label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Ganha</p><p className="mt-1 text-xl font-semibold">{pts(earned)}</p><p className="text-xs text-muted-foreground">= {money(discountForPoints(earned, s.real_per_100_points))} em desconto</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Disponível em</p><p className="mt-1 text-xl font-semibold">{date(release.toISOString())}</p><p className="text-xs text-muted-foreground">vence em {date(expiry.toISOString())}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Na próxima compra pode usar</p><p className="mt-1 text-xl font-semibold">{pts(usable)}</p><p className="text-xs text-muted-foreground">{usable ? `${money(discountForPoints(usable, s.real_per_100_points))} de desconto (limite de ${s.max_redeem_pct}% = ${money(nextValue * s.max_redeem_pct / 100)})` : `Saldo ou limite do pedido abaixo do mínimo de ${pts(s.min_redeem_points)}`}</p></div>
      </div>
    </section>
  </div>;
}

function CustomersTab({ settings }: { settings: LoyaltySettings }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const query = useQuery({ queryKey: ["admin", "loyalty", "customers"], queryFn: () => api<{ customers: Customer[] }>("GET", "?view=customers"), retry: false, staleTime: 15_000 });
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (query.data?.customers ?? [])
      .filter((c) => !term || (c.full_name ?? "").toLocaleLowerCase("pt-BR").includes(term) || c.email.toLocaleLowerCase("pt-BR").includes(term))
      .sort((a, b) => b.available + b.pending - (a.available + a.pending));
  }, [query.data, search]);

  return <div className="space-y-4">
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="font-semibold">Clientes com pontos</h3><p className="mt-1 text-sm text-muted-foreground">Clique num cliente para ver o extrato completo e fazer ajustes.</p></div>
        <label className="relative block sm:w-80"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou e-mail…" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" /></label>
      </div>
      {query.isError ? <div className="p-6 text-sm text-destructive">{query.error.message}</div>
        : query.isPending ? <div className="p-6 text-sm text-muted-foreground">Carregando clientes…</div>
        : rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 text-right font-medium">Disponível</th><th className="px-5 py-3 text-right font-medium">Em liberação</th><th className="px-5 py-3 text-right font-medium">Vence em 30 dias</th><th className="px-5 py-3 text-right font-medium">Ganhos</th><th className="px-5 py-3 text-right font-medium">Usados</th><th className="px-5 py-3 font-medium">Última movimentação</th></tr></thead>
          <tbody className="divide-y">{rows.map((c) => <tr key={c.user_id} onClick={() => setSelected(c)} className={`cursor-pointer hover:bg-secondary/40 ${selected?.user_id === c.user_id ? "bg-orange-50/60" : ""}`}>
            <td className="px-5 py-3"><p className="font-medium">{c.full_name || "Sem nome"}</p><p className="text-xs text-muted-foreground">{c.email}</p></td>
            <td className="px-5 py-3 text-right"><p className="font-semibold tabular-nums">{pts(c.available)}</p><p className="text-xs text-muted-foreground">{money(discountForPoints(c.available, settings.real_per_100_points))}</p></td>
            <td className="px-5 py-3 text-right tabular-nums">{pts(c.pending)}</td>
            <td className={`px-5 py-3 text-right tabular-nums ${c.expiring_30d > 0 ? "font-semibold text-amber-700" : ""}`}>{pts(c.expiring_30d)}</td>
            <td className="px-5 py-3 text-right tabular-nums">{pts(c.earned)}</td>
            <td className="px-5 py-3 text-right tabular-nums">{pts(c.redeemed)}</td>
            <td className="px-5 py-3 text-muted-foreground">{c.last_activity ? date(c.last_activity) : "—"}</td>
          </tr>)}</tbody>
        </table></div>
        : <div className="p-10 text-center text-sm text-muted-foreground">{query.data?.customers.length ? "Nenhum cliente com essa busca." : "Nenhum cliente com pontos ainda. Eles aparecem aqui quando a primeira compra de cliente final for paga."}</div>}
    </section>
    {selected && <CustomerDetail customer={selected} settings={settings} onClose={() => setSelected(null)} />}
  </div>;
}

function CustomerDetail({ customer, settings, onClose }: { customer: Customer; settings: LoyaltySettings; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const query = useQuery({ queryKey: ["admin", "loyalty", "customer", customer.user_id], queryFn: () => api<{ ledger: Entry[]; balance: { available: number; pending: number; expiring_30d: number; next_expiry: string | null } }>("GET", `?view=customer&user_id=${customer.user_id}`), retry: false });
  const adjust = useMutation({
    mutationFn: () => api("POST", "", { user_id: customer.user_id, points: (mode === "debit" ? -1 : 1) * Math.trunc(Number(amount)), reason }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin", "loyalty"] })]);
      setAmount(""); setReason("");
      toast.success(mode === "credit" ? "Pontos creditados." : "Pontos debitados.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const b = query.data?.balance;
  return <section className="rounded-xl border-2 border-orange-200 bg-card">
    <div className="flex items-start justify-between gap-3 border-b p-5">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Extrato do cliente</p><h3 className="mt-1 text-lg font-semibold">{customer.full_name || customer.email}</h3><p className="text-sm text-muted-foreground">{customer.email}</p></div>
      <button type="button" onClick={onClose} aria-label="Fechar extrato" className="rounded-md p-2 hover:bg-secondary"><X className="size-4" /></button>
    </div>
    <div className="grid gap-3 border-b p-5 sm:grid-cols-4">
      <div><p className="text-xs text-muted-foreground">Disponível</p><p className="text-xl font-semibold">{pts(b?.available ?? customer.available)}</p><p className="text-xs text-muted-foreground">{money(discountForPoints(b?.available ?? customer.available, settings.real_per_100_points))}</p></div>
      <div><p className="text-xs text-muted-foreground">Em liberação</p><p className="text-xl font-semibold">{pts(b?.pending ?? customer.pending)}</p></div>
      <div><p className="text-xs text-muted-foreground">Vence em 30 dias</p><p className="text-xl font-semibold">{pts(b?.expiring_30d ?? customer.expiring_30d)}</p></div>
      <div><p className="text-xs text-muted-foreground">Próximo vencimento</p><p className="text-xl font-semibold">{date(b?.next_expiry ?? customer.next_expiry)}</p></div>
    </div>
    {query.isError ? <div className="p-6 text-sm text-destructive">{query.error.message}</div>
      : query.isPending ? <div className="p-6 text-sm text-muted-foreground">Carregando extrato…</div>
      : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Data</th><th className="px-5 py-3 font-medium">Tipo</th><th className="px-5 py-3 text-right font-medium">Pontos</th><th className="px-5 py-3 font-medium">Pedido</th><th className="px-5 py-3 font-medium">Descrição</th><th className="px-5 py-3 font-medium">Lote (crédito)</th></tr></thead>
        <tbody className="divide-y">{query.data.ledger.map((e) => <tr key={e.id}>
          <td className="px-5 py-3 text-muted-foreground">{dateTime(e.created_at)}</td>
          <td className="px-5 py-3"><Kind kind={e.kind} /></td>
          <td className={`px-5 py-3 text-right font-semibold tabular-nums ${e.points < 0 ? "text-rose-700" : "text-emerald-700"}`}>{e.points > 0 ? "+" : ""}{pts(e.points)}</td>
          <td className="px-5 py-3 font-mono text-xs">{orderCode(e.order_id)}</td>
          <td className="px-5 py-3">{e.description}{e.created_by && <span className="block text-xs text-muted-foreground">Lançado por um administrador</span>}</td>
          <td className="px-5 py-3 text-xs text-muted-foreground">{e.remaining != null ? <>Restam {pts(e.remaining)}<br />Libera {date(e.available_at)} · vence {date(e.expires_at)}</> : "—"}</td>
        </tr>)}</tbody>
      </table></div>}
    <form className="grid gap-3 border-t bg-secondary/30 p-5 md:grid-cols-[auto_160px_1fr_auto] md:items-end" onSubmit={(e) => { e.preventDefault(); if (window.confirm(`${mode === "credit" ? "Creditar" : "Debitar"} ${amount} pts de ${customer.full_name || customer.email}?`)) adjust.mutate(); }}>
      <div className="flex gap-1 rounded-lg border bg-background p-1 text-sm">
        <button type="button" onClick={() => setMode("credit")} className={`rounded-md px-3 py-1.5 ${mode === "credit" ? "bg-emerald-600 text-white" : ""}`}>Creditar</button>
        <button type="button" onClick={() => setMode("debit")} className={`rounded-md px-3 py-1.5 ${mode === "debit" ? "bg-rose-600 text-white" : ""}`}>Debitar</button>
      </div>
      <label className="text-sm font-medium">Pontos<input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" required className={field} /></label>
      <label className="text-sm font-medium">Motivo (aparece no extrato)<input value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={300} placeholder="Ex.: cortesia por atraso na entrega" className={field} /></label>
      <button type="submit" disabled={adjust.isPending || !amount || !reason.trim()} className="h-10 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50">{adjust.isPending ? "Salvando…" : "Registrar ajuste"}</button>
      <p className="text-xs text-muted-foreground md:col-span-4">Crédito entra disponível na hora e vence em {settings.expiry_months} meses. Débito sai dos pontos que vencem primeiro e não pode deixar o saldo negativo. Todo ajuste fica registrado com data e autor.</p>
    </form>
  </section>;
}

function TransactionsTab({ settings }: { settings: LoyaltySettings }) {
  const [kind, setKind] = useState("");
  const [days, setDays] = useState("30");
  const query = useQuery({ queryKey: ["admin", "loyalty", "transactions", kind, days], queryFn: () => api<{ transactions: Entry[] }>("GET", `?view=transactions${kind ? `&kind=${kind}` : ""}${days !== "all" ? `&days=${days}` : ""}`), retry: false, staleTime: 15_000 });
  const rows = query.data?.transactions ?? [];
  const exportCsv = () => {
    const csv = toCsv(["Data", "Cliente", "Tipo", "Pontos", "Valor (R$)", "Pedido", "Descrição", "Libera em", "Vence em", "Lançado por"],
      rows.map((e) => [dateTime(e.created_at), e.customer ?? "", LEDGER_LABEL[e.kind] ?? e.kind, e.points, discountForPoints(Math.abs(e.points), settings.real_per_100_points) * Math.sign(e.points), orderCode(e.order_id), e.description, date(e.available_at), date(e.expires_at), e.by_admin ?? ""]));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `store-house-pontos-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <section className="overflow-hidden rounded-xl border bg-card">
    <div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-center">
      <div className="flex-1"><h3 className="font-semibold">Movimentações</h3><p className="mt-1 text-sm text-muted-foreground">Cada crédito, uso, devolução, estorno, vencimento e ajuste, com o pedido de origem.</p></div>
      <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(LEDGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select value={days} onChange={(e) => setDays(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Período"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Últimos 12 meses</option><option value="all">Tudo</option></select>
      <button type="button" onClick={exportCsv} disabled={!rows.length} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#171a1f] px-3 text-sm font-semibold text-white disabled:opacity-50"><Download className="size-4" />Exportar CSV</button>
    </div>
    {query.isError ? <div className="p-6 text-sm text-destructive">{query.error.message}</div>
      : query.isPending ? <div className="p-6 text-sm text-muted-foreground">Carregando movimentações…</div>
      : rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Data</th><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 font-medium">Tipo</th><th className="px-5 py-3 text-right font-medium">Pontos</th><th className="px-5 py-3 text-right font-medium">Valor</th><th className="px-5 py-3 font-medium">Pedido</th><th className="px-5 py-3 font-medium">Descrição</th></tr></thead>
        <tbody className="divide-y">{rows.map((e) => <tr key={e.id}>
          <td className="px-5 py-3 text-muted-foreground">{dateTime(e.created_at)}</td>
          <td className="px-5 py-3 font-medium">{e.customer}</td>
          <td className="px-5 py-3"><Kind kind={e.kind} /></td>
          <td className={`px-5 py-3 text-right font-semibold tabular-nums ${e.points < 0 ? "text-rose-700" : "text-emerald-700"}`}>{e.points > 0 ? "+" : ""}{pts(e.points)}</td>
          <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{money(discountForPoints(Math.abs(e.points), settings.real_per_100_points))}</td>
          <td className="px-5 py-3 font-mono text-xs">{orderCode(e.order_id)}</td>
          <td className="px-5 py-3">{e.description}{e.by_admin && <span className="block text-xs text-muted-foreground">Por {e.by_admin}</span>}</td>
        </tr>)}</tbody>
      </table></div>
      : <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma movimentação com esses filtros.</div>}
  </section>;
}

function RulesTab({ settings }: { settings: LoyaltySettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<keyof LoyaltySettings, string | boolean> | null>(null);
  useEffect(() => {
    setForm({ enabled: settings.enabled, points_per_real: String(Math.round(settings.points_per_real * 100)), real_per_100_points: String(Number((settings.real_per_100_points / 100).toFixed(4))), max_redeem_pct: String(settings.max_redeem_pct), min_redeem_points: String(settings.min_redeem_points), grace_days: String(settings.grace_days), expiry_months: String(settings.expiry_months) });
  }, [settings]);
  const payload = form ? { ...form, points_per_real: Number(String(form.points_per_real).replace(",", ".")) / 100, real_per_100_points: Number(String(form.real_per_100_points).replace(",", ".")) * 100 } : null;
  const save = useMutation({
    mutationFn: () => {
      const parsed = parseLoyaltySettings(payload);
      if (!parsed.ok) throw new Error(parsed.error);
      return api("PUT", "", parsed.settings);
    },
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["admin", "loyalty"] }), qc.invalidateQueries({ queryKey: ["loyalty"] })]); toast.success("Regras do programa salvas."); },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!form) return null;
  const num = (k: keyof LoyaltySettings) => String(form[k] ?? "");
  const set = (k: keyof LoyaltySettings, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const perReal = Number(num("points_per_real").replace(",", ".")) || 0;
  const per100 = Number(num("real_per_100_points").replace(",", ".")) || 0;
  const cashback = Math.round(perReal * per100 * 100) / 100;
  const valid = num("points_per_real").trim() !== "" && num("real_per_100_points").trim() !== "" && Number.isInteger(perReal) && Math.abs(per100 * 10000 - Math.round(per100 * 10000)) < 1e-7 && parseLoyaltySettings(payload).ok;
  const help = "mt-1 block text-xs font-normal text-muted-foreground";
  return <form className="rounded-xl border bg-card" onSubmit={(e) => { e.preventDefault(); if (!valid) return; if ((form.enabled && !settings.enabled || cashback > 1 || per100 !== settings.real_per_100_points / 100) && !window.confirm(`Salvar regras com retorno nominal de ${cashback}%? Confira o impacto financeiro e os saldos existentes.`)) return; save.mutate(); }}>
    <div className="border-b p-5"><h3 className="font-semibold">Regras do programa</h3><p className="mt-1 text-sm text-muted-foreground">Mudanças valem para as próximas compras e resgates. Alterar o valor do ponto também altera o valor em reais dos saldos existentes. Lotes mantêm a liberação e o vencimento.</p></div>
    <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm md:col-span-2 xl:col-span-3"><span><span className="font-medium">Programa ativo</span><span className={help}>Pausado: ninguém ganha nem usa pontos, e o saldo fica guardado.</span></span><input type="checkbox" checked={form.enabled === true} onChange={(e) => set("enabled", e.target.checked)} className="size-4 accent-orange-600" /></label>
      <label className="text-sm font-medium">Pontos ganhos a cada R$ 100,00 em produtos<input value={num("points_per_real")} onChange={(e) => set("points_per_real", e.target.value)} inputMode="decimal" className={field} /><span className={help}>Ex.: 1 → compra de R$ 500 rende 5 pontos. Somente pontos inteiros por compra.</span></label>
      <label className="text-sm font-medium">Valor de cada ponto (R$)<input value={num("real_per_100_points")} onChange={(e) => set("real_per_100_points", e.target.value)} inputMode="decimal" className={field} /><span className={help}>Ex.: 1 → cada ponto vale R$ 1,00 de desconto.</span></label>
      <label className="text-sm font-medium">Limite de uso por pedido (% dos produtos)<input value={num("max_redeem_pct")} onChange={(e) => set("max_redeem_pct", e.target.value)} inputMode="decimal" className={field} /><span className={help}>Teto do desconto em pontos num pedido (máximo 50%). Protege a margem.</span></label>
      <label className="text-sm font-medium">Mínimo de pontos por resgate<input value={num("min_redeem_points")} onChange={(e) => set("min_redeem_points", e.target.value)} inputMode="numeric" className={field} /><span className={help}>Abaixo disso o cliente ainda não consegue usar os pontos.</span></label>
      <label className="text-sm font-medium">Prazo de liberação (dias)<input value={num("grace_days")} onChange={(e) => set("grace_days", e.target.value)} inputMode="numeric" className={field} /><span className={help}>Tempo entre o pagamento e os pontos ficarem disponíveis. 7 = prazo de arrependimento.</span></label>
      <label className="text-sm font-medium">Validade dos pontos (meses)<input value={num("expiry_months")} onChange={(e) => set("expiry_months", e.target.value)} inputMode="numeric" className={field} /><span className={help}>Contada a partir da liberação de cada lote.</span></label>
    </div>
    <div className="mx-5 mb-5 rounded-xl border bg-secondary/40 p-5"><h4 className="font-semibold">Confira antes de salvar</h4><p className="mt-2 text-sm">A cada R$ 100 em produtos: {pts(perReal)} = {money(perReal * per100)} em desconto nominal.</p><p className="mt-1 text-sm">Exemplo: compra de R$ 4.210,00 gera {pts(pointsForAmount(4210, perReal / 100))}, equivalentes a {money(discountForPoints(pointsForAmount(4210, perReal / 100), per100 * 100))}.</p>{cashback > 1 && <p role="alert" className="mt-2 text-sm font-semibold text-amber-700">Atenção: retorno superior a 1%. Confira a margem da loja.</p>}{!valid && <p role="alert" className="mt-2 text-sm text-destructive">Confira os valores: pontos por R$ 100 devem ser inteiros e o valor do ponto pode ter até quatro casas decimais. Os demais limites continuam válidos.</p>}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Coins className="size-4 text-brand" />Com estes valores, o cliente recebe <strong className="text-foreground">{cashback.toLocaleString("pt-BR")}% de volta</strong> em desconto <ArrowRight className="size-3.5" /> veja na aba "Como funciona".</p>
      <button type="submit" disabled={save.isPending || !valid} className="h-10 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? "Salvando…" : "Salvar regras"}</button>
    </div>
  </form>;
}
