import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Copy, ExternalLink, Link2, MousePointerClick, Package, Search, ShoppingBag, Wallet, TrendingUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { catalogService, type CatalogProduct } from "@/services/catalog";
import { useAffiliateSettings } from "@/hooks/useAffiliateSettings";

type AffiliateDashboard = {
  profile: { user_id: string; referral_code: string; commission_rate: number; commission_override_pct: number | null; status: string; display_name: string | null };
  metrics: { clicks: number; sales: number; conversion: number; pendingCommission: number };
  points: { performance: number; reward: number };
  leaderboard: Array<{ user_id: string; name: string; points: number; level: string; commission_pct: number; position: number }>;
  my_position: number | null;
  level: { name: string; min_points: number; commission_pct: number; next_name: string | null; next_min_points: number | null; sales_to_next_level: number | null; performance_window_days: number };
  links: Array<{ id: string; product_id: string; slug: string; is_active: boolean; clicks30d: number; products: { name: string } | null }>;
  sales: Array<{ id: string; affiliate_link_id: string; total: number; status: string; created_at: string; commission_pct_applied: number | null; commission_base_amount: number | null; product_name: string; link_slug: string }>;
  commissions: Array<{ id: string; order_id: string; order_total: number; commission_rate: number; commission_amount: number; status: string; paid_at: string | null; payment_reference: string | null; created_at: string }>;
};
async function getToken() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente.");
  return data.session.access_token;
}
async function loadAffiliateDashboard(): Promise<AffiliateDashboard> {
  const token = await getToken();
  const response = await fetch("/api/affiliate/dashboard", { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({})) as AffiliateDashboard & { error?: string };
  if (!response.ok) throw new Error(body.error || "Não foi possível carregar o portal.");
  return body;
}
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));

export function AffiliateOverview() {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const queryClient = useQueryClient();
  const dashboard = useQuery({ queryKey: ["affiliate", "dashboard"], queryFn: loadAffiliateDashboard, retry: false, staleTime: 0, refetchOnWindowFocus: true });
  const settingsQuery = useAffiliateSettings();
  const catalog = useQuery({ queryKey: ["affiliate", "product-catalog"], queryFn: catalogService.list, staleTime: 60_000 });
  const products = catalog.data?.products ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return products.filter((product) => !term || product.name.toLocaleLowerCase("pt-BR").includes(term) || (product.sku ?? "").toLocaleLowerCase("pt-BR").includes(term)).slice(0, 60);
  }, [products, search]);
  const profile = dashboard.data?.profile;
  const selected = products.find((product) => product.slug === selectedProduct);
  const existingLink = dashboard.data?.links.find((link) => link.product_id === selectedProduct && link.is_active);
  const linkMutation = useMutation({
    mutationFn: async (product: CatalogProduct) => {
      const token = await getToken();
      const response = await fetch("/api/affiliate/links", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.slug }),
      });
      const body = await response.json().catch(() => ({})) as { link?: { id: string; slug: string }; error?: string };
      if (!response.ok || !body.link) throw new Error(body.error || "Não foi possível gerar o link.");
      return body.link;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["affiliate", "dashboard"] });
      toast.success("Link de indicação pronto.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const referralUrl = existingLink && typeof window !== "undefined" ? `${window.location.origin}/r/${existingLink.slug}` : "";
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success("Link de indicação copiado."); }
    catch { toast.error("Não foi possível copiar. Selecione e copie o link manualmente."); }
  };
  if (dashboard.isPending || settingsQuery.isPending) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando seu painel de afiliado…</div>;
  if (dashboard.isError || settingsQuery.isError) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><p className="font-semibold">Não foi possível abrir seu painel.</p><p className="mt-2">{dashboard.error?.message || settingsQuery.error?.message}</p><button type="button" onClick={() => {void dashboard.refetch();void settingsQuery.refetch();}} className="mt-4 rounded-md border border-amber-400 px-3 py-2 font-medium">Tentar novamente</button></div>;
  const { metrics } = dashboard.data;
  const settings = settingsQuery.data;
  const cards = [
    { label: "Cliques rastreados (30d)", value: metrics.clicks.toLocaleString("pt-BR"), detail: "Visitas únicas registradas", icon: MousePointerClick },
    { label: "Vendas atribuídas (30d)", value: metrics.sales.toLocaleString("pt-BR"), detail: "Pedidos associados aos seus links", icon: ShoppingBag },
    { label: "Conversão (30d)", value: `${metrics.conversion.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`, detail: "Vendas divididas por cliques", icon: TrendingUp },
    { label: "Comissão pendente", value: money(metrics.pendingCommission), detail: "Pedidos pagos aguardando liberação", icon: Wallet },
  ];
  const commissionPct = dashboard.data.level.commission_pct;
  return <div className="space-y-6">
    <section className="rounded-2xl bg-[#171a1f] p-6 text-white sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#ff925d]">Área do parceiro</p>
      <h2 className="mt-2 text-2xl font-semibold">Olá, {profile?.display_name || "Afiliado"}!</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Escolha produtos do catálogo, gere links exclusivos e acompanhe os resultados das indicações.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm">Comissão padrão: <strong className="ml-1">{Number(commissionPct).toLocaleString("pt-BR")}%</strong></span>
        <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm">Link válido por <strong>{settings.attribution_window_days} dias</strong></span>
        <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm">Sua comissão é liberada <strong>{settings.grace_days} dias</strong> após o pagamento</span>
        <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm">Saque mínimo: <strong>{money(settings.min_withdrawal)}</strong></span>
      </div>
    </section>
    <section className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seu nível atual</p><h3 className="mt-1 text-2xl font-semibold">{dashboard.data.level.name}</h3><p className="mt-1 text-sm text-muted-foreground">Comissão do nível: {Number(dashboard.data.level.commission_pct).toLocaleString("pt-BR")}% · apuração nos últimos {dashboard.data.level.performance_window_days} dias.</p></div><div className="rounded-lg bg-orange-50 px-4 py-3 text-right"><p className="text-xs text-orange-900">Pontos na janela</p><p className="text-xl font-semibold text-orange-950">{Number(dashboard.data.points.performance).toLocaleString("pt-BR")} pts</p></div></div>{dashboard.data.level.next_name ? <p className="mt-4 rounded-lg border p-3 text-sm">Faltam {dashboard.data.level.sales_to_next_level === null ? "—" : money(dashboard.data.level.sales_to_next_level)} em vendas elegíveis para alcançar o nível {dashboard.data.level.next_name}.</p> : <p className="mt-4 rounded-lg border p-3 text-sm">Você já alcançou o nível máximo disponível.</p>}</section>
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h3 className="font-semibold">Ranking dos afiliados</h3><p className="mt-1 text-sm text-muted-foreground">Classificação por pontos de desempenho nos últimos {dashboard.data.level.performance_window_days} dias.</p></div><div className="rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-900">Sua posição: {dashboard.data.my_position ? "#" + dashboard.data.my_position : "Sem pontuação"}</div></div>
      {dashboard.data.leaderboard.length ? <div className="divide-y">{dashboard.data.leaderboard.map((item)=><div key={item.user_id} className={"flex items-center gap-3 px-5 py-3 text-sm " + (item.user_id===profile?.user_id ? "bg-orange-50/70 font-semibold" : "")}><span className="w-9 text-muted-foreground">#{item.position}</span><span className="min-w-0 flex-1 truncate">{item.user_id===profile?.user_id ? "Você" : item.name}</span><span className="rounded-full bg-secondary px-2 py-1 text-xs">{item.level}</span><span className="tabular-nums">{item.points.toLocaleString("pt-BR")} pts</span></div>)}</div> : <p className="p-5 text-sm text-muted-foreground">O ranking será formado conforme as vendas elegíveis forem pagas e cumprirem o prazo de carência.</p>}
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({label,value,detail,icon:Icon}) => <article key={label} className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className="grid size-9 place-items-center rounded-lg bg-secondary"><Icon className="size-4" /></span></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}
    </section>
    <section className="grid gap-3 sm:grid-cols-2">
      <article className="rounded-xl border bg-card p-5"><h3 className="text-sm font-semibold">Pontos de desempenho</h3><p className="mt-3 text-2xl font-semibold">{Number(dashboard.data.points.performance).toLocaleString("pt-BR")} pts</p><p className="mt-1 text-xs text-muted-foreground">Saldo para metas e ranking. Regra atual: {Number(settings.performance_points_per_real).toLocaleString("pt-BR")} ponto(s) por R$ 1,00 elegível. Não é dinheiro e não pode ser sacado.</p></article>
      <article className="rounded-xl border bg-card p-5"><h3 className="text-sm font-semibold">Pontos de recompensa</h3><p className="mt-3 text-2xl font-semibold">{Number(dashboard.data.points.reward).toLocaleString("pt-BR")} pts</p><p className="mt-1 text-xs text-muted-foreground">{settings.reward_points_enabled ? "Saldo para trocar por benefícios. Regra atual: " + Number(settings.reward_points_per_real).toLocaleString("pt-BR") + " ponto(s) por R$ 1,00 elegível." : "O acúmulo de pontos resgatáveis está temporariamente desabilitado."}</p></article>
    </section>
    <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><div className="flex items-center gap-2"><Link2 className="size-5 text-[#f26a2c]" /><h3 className="font-semibold">Gerar link de indicação</h3></div><p className="mt-1 text-sm text-muted-foreground">Selecione um produto para criar ou reutilizar seu link exclusivo.</p></div>
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto por nome ou SKU…" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
          {catalog.isError ? <p className="text-sm text-destructive">Não foi possível carregar o catálogo real.</p> : catalog.data?.isDemo ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">O catálogo está em modo de demonstração. Links reais exigem catálogo conectado.</p> : null}
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
            {catalog.isPending ? <p className="p-3 text-sm text-muted-foreground">Carregando produtos…</p> : filtered.map((product) => <button key={product.slug} type="button" onClick={() => setSelectedProduct(product.slug)} className={`flex w-full items-center gap-3 rounded-md p-3 text-left transition ${selectedProduct === product.slug ? "bg-orange-50 ring-1 ring-orange-300" : "hover:bg-secondary"}`}><Package className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{product.name}</span><span className="block truncate text-xs text-muted-foreground">{product.sku || product.category}</span></span>{selectedProduct === product.slug && <span className="text-xs font-semibold text-orange-700">Selecionado</span>}</button>)}
            {!catalog.isPending && !filtered.length && <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-xl border bg-secondary/40 p-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seu link exclusivo</p><h4 className="mt-2 font-semibold">{selected?.name || "Selecione um produto"}</h4><p className="mt-2 break-all rounded-lg border bg-background p-3 text-sm text-muted-foreground">{referralUrl || "Gere o link para exibi-lo aqui."}</p></div>
          <div className="mt-5 flex flex-wrap gap-2">
            {!existingLink && <button type="button" disabled={!selected || !!catalog.data?.isDemo || profile?.status !== "active" || linkMutation.isPending} onClick={() => selected && linkMutation.mutate(selected)} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{linkMutation.isPending ? "Gerando…" : "Gerar link"}</button>}
            {referralUrl && <><button type="button" onClick={() => void copy(referralUrl)} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white"><Copy className="size-4" /> Copiar link</button><a href={referralUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-background"><ExternalLink className="size-4" /> Abrir link</a></>}
          </div>
        </div>
      </div>
    </section>
    <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Últimas comissões</h3><p className="mt-1 text-sm text-muted-foreground">As comissões são registradas após a confirmação do pagamento, usando as regras salvas no momento da criação do pedido.</p></div>
      {dashboard.data.commissions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Pedido</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Situação</th></tr></thead><tbody className="divide-y">{dashboard.data.commissions.map((item) => <tr key={item.id}><td className="px-5 py-3 text-muted-foreground">{date(item.created_at)}</td><td className="px-5 py-3">{item.order_id.slice(0,8).toUpperCase()}</td><td className="px-5 py-3 font-medium">{money(Number(item.commission_amount))}</td><td className="px-5 py-3">{item.status}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center"><BadgePercent className="mx-auto size-7 text-muted-foreground/60" /><p className="mt-2 text-sm font-medium">Nenhuma comissão registrada</p><p className="mt-1 text-xs text-muted-foreground">Quando houver uma venda paga e atribuída, ela aparecerá aqui.</p></div>}
    </section>
  </div>;
}


export function AffiliateSectionView({ section }: { section: "link" | "vendas" | "comissoes" | "pagamentos" }) {
  const queryClient = useQueryClient();
  const dashboard = useQuery({ queryKey: ["affiliate", "dashboard"], queryFn: loadAffiliateDashboard, retry: false, staleTime: 0, refetchOnWindowFocus: true });
  const deleteLink = useMutation({
    mutationFn: async (linkId: string) => {
      const token = await getToken();
      const response = await fetch(`/api/affiliate/links?id=${encodeURIComponent(linkId)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir o link.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["affiliate", "dashboard"] });
      toast.success("Link excluído e desativado com sucesso.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const titles = {
    link: ["Link de indicação", "Seus links exclusivos por produto."],
    vendas: ["Vendas atribuídas", "Pedidos pagos associados aos seus links."],
    comissoes: ["Comissões", "Comissões geradas pelas vendas atribuídas."],
    pagamentos: ["Pagamentos", "Histórico de comissões efetivamente pagas."],
  } as const;
  const [title, description] = titles[section];
  if (dashboard.isPending) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando {title.toLocaleLowerCase("pt-BR")}…</div>;
  if (dashboard.isError) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><p className="font-semibold">Não foi possível carregar esta seção.</p><p className="mt-2">{dashboard.error.message}</p><button type="button" onClick={() => void dashboard.refetch()} className="mt-4 rounded-md border border-amber-400 px-3 py-2 font-medium">Tentar novamente</button></div>;
  const data = dashboard.data;
  const fmt = (value: number) => money(Number(value ?? 0));
  const statusLabel = (status: string) => ({ pending: "Pendente", approved: "Aprovada", paid: "Paga", cancelled: "Cancelada", reversed: "Estornada" }[status] ?? status);
  const tableClass = "w-full min-w-[680px] text-left text-sm";
  return <section className="rounded-xl border bg-card">
    <div className="border-b p-5"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
    {section === "link" ? data.links.length ? <div className="overflow-x-auto"><table className={tableClass}><thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Produto</th><th className="px-5 py-3">Link</th><th className="px-5 py-3">Cliques (30d)</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">{data.links.map((link) => <tr key={link.id}><td className="px-5 py-3 font-medium">{link.products?.name ?? "Produto"}</td><td className="px-5 py-3">{link.is_active ? <button type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/r/${link.slug}`).then(() => toast.success("Link copiado."), () => toast.error("Não foi possível copiar o link."))} className="font-mono text-xs text-orange-700 underline underline-offset-4">/r/{link.slug}</button> : <span className="font-mono text-xs text-muted-foreground">/r/{link.slug}</span>}</td><td className="px-5 py-3">{link.clicks30d ?? "—"}</td><td className="px-5 py-3">{link.is_active ? "Ativo" : "Desativado"}</td><td className="px-5 py-3 text-right">{link.is_active ? <button type="button" disabled={deleteLink.isPending} onClick={() => { if (window.confirm("Deseja excluir este link? Ele deixará de funcionar para novas indicações. O histórico de cliques, vendas e comissões será preservado.")) deleteLink.mutate(link.id); }} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50" aria-label={`Excluir link de ${link.products?.name ?? "produto"}`}><Trash2 className="size-3.5" /> Excluir</button> : <span className="text-xs text-muted-foreground">Link excluído</span>}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center text-sm text-muted-foreground">Você ainda não gerou links de indicação. Acesse a Visão geral para escolher um produto.</div> : null}
    {section === "vendas" ? data.sales.length ? <div className="overflow-x-auto"><table className={tableClass}><thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Pedido</th><th className="px-5 py-3">Produto</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y">{data.sales.map((sale) => <tr key={sale.id}><td className="px-5 py-3">{date(sale.created_at)}</td><td className="px-5 py-3 font-mono text-xs">{sale.id.slice(0,8).toUpperCase()}</td><td className="px-5 py-3">{sale.product_name}</td><td className="px-5 py-3 font-medium">{fmt(sale.total)}</td><td className="px-5 py-3">{statusLabel(sale.status)}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma venda paga foi atribuída aos seus links nos últimos 30 dias.</div> : null}
    {section === "comissoes" ? data.commissions.length ? <div className="overflow-x-auto"><table className={tableClass}><thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Pedido</th><th className="px-5 py-3">Base da comissão</th><th className="px-5 py-3">Taxa</th><th className="px-5 py-3">Comissão</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y">{data.commissions.map((item) => <tr key={item.id}><td className="px-5 py-3">{date(item.created_at)}</td><td className="px-5 py-3 font-mono text-xs">{item.order_id.slice(0,8).toUpperCase()}</td><td className="px-5 py-3">{fmt(item.order_total)}</td><td className="px-5 py-3">{Number(item.commission_rate).toLocaleString("pt-BR")}%</td><td className="px-5 py-3 font-semibold">{fmt(item.commission_amount)}</td><td className="px-5 py-3">{statusLabel(item.status)}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma comissão foi registrada até o momento.</div> : null}
    {section === "pagamentos" ? data.commissions.filter((item) => item.status === "paid").length ? <div className="overflow-x-auto"><table className={tableClass}><thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Data do pagamento</th><th className="px-5 py-3">Pedido</th><th className="px-5 py-3">Valor recebido</th><th className="px-5 py-3">Referência</th></tr></thead><tbody className="divide-y">{data.commissions.filter((item) => item.status === "paid").map((item) => <tr key={item.id}><td className="px-5 py-3">{item.paid_at ? date(item.paid_at) : "—"}</td><td className="px-5 py-3 font-mono text-xs">{item.order_id.slice(0,8).toUpperCase()}</td><td className="px-5 py-3 font-semibold">{fmt(item.commission_amount)}</td><td className="px-5 py-3">{item.payment_reference || "—"}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center text-sm text-muted-foreground">Ainda não há pagamentos de comissão registrados.</div> : null}
  </section>;
}
