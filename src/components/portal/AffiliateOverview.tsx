import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgePercent, Copy, ExternalLink, Link2, MousePointerClick, Package, Search, ShoppingBag, Wallet } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { catalogService, slugifyProductName, type CatalogProduct } from "@/services/catalog";

type AffiliateDashboard = {
  profile: { referral_code: string; commission_rate: number; status: string; display_name: string | null };
  metrics: {
    clicks: number;
    commissions: number;
    commissionTotals: { total: number; pending: number; available: number; paid: number };
    points: { performance: number; reward: number };
  };
  commissions: Array<{ id: string; order_id: string; commission_amount: number; status: string; created_at: string }>;
};

async function loadAffiliateDashboard(): Promise<AffiliateDashboard> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
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
  const dashboard = useQuery({ queryKey: ["affiliate", "dashboard"], queryFn: loadAffiliateDashboard, retry: false, staleTime: 30_000 });
  const catalog = useQuery({ queryKey: ["affiliate", "product-catalog"], queryFn: catalogService.list, staleTime: 60_000 });
  const products = catalog.data?.products ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return products.filter((product) => !term || product.name.toLocaleLowerCase("pt-BR").includes(term) || (product.sku ?? "").toLocaleLowerCase("pt-BR").includes(term)).slice(0, 60);
  }, [products, search]);
  const profile = dashboard.data?.profile;
  const selected = products.find((product) => product.slug === selectedProduct);
  const referralUrl = profile && selected
    ? `${typeof window === "undefined" ? "" : window.location.origin}/produto/${slugifyProductName(selected.name)}?ref=${encodeURIComponent(profile.referral_code)}`
    : "";

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie o link manualmente.");
    }
  };

  if (dashboard.isPending) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando seu painel de afiliado…</div>;
  if (dashboard.isError) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><p className="font-semibold">Não foi possível abrir seu painel.</p><p className="mt-2">{dashboard.error.message}</p><button type="button" onClick={() => void dashboard.refetch()} className="mt-4 rounded-md border border-amber-400 px-3 py-2 font-medium">Tentar novamente</button></div>;

  const { metrics } = dashboard.data;
  const cards = [
    { label: "Cliques no seu link", value: metrics.clicks.toLocaleString("pt-BR"), detail: "Visitas rastreadas", icon: MousePointerClick },
    { label: "Comissões registradas", value: metrics.commissions.toLocaleString("pt-BR"), detail: "Pedidos atribuídos", icon: BadgePercent },
    { label: "Comissões pendentes", value: money(metrics.commissionTotals.pending), detail: "Aguardando validação", icon: Wallet },
    { label: "Comissões pagas", value: money(metrics.commissionTotals.paid), detail: "Total já liquidado", icon: ShoppingBag },
  ];

  return <div className="space-y-6">
    <section className="rounded-2xl bg-[#171a1f] p-6 text-white sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#ff925d]">Área do parceiro</p>
      <h2 className="mt-2 text-2xl font-semibold">Olá, {profile?.display_name || "Afiliado"}!</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Escolha produtos do catálogo, gere seus links exclusivos e acompanhe os resultados das suas indicações.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm">Seu código: <strong className="ml-1 tracking-wider">{profile?.referral_code}</strong></span>
        <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm">Comissão padrão: <strong className="ml-1">{Number(profile?.commission_rate ?? 0).toLocaleString("pt-BR")}%</strong></span>
        <span className={`rounded-lg px-3 py-2 text-sm ${profile?.status === "active" ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"}`}>{profile?.status === "active" ? "Conta ativa" : "Conta suspensa"}</span>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({label,value,detail,icon:Icon}) => <article key={label} className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className="grid size-9 place-items-center rounded-lg bg-secondary"><Icon className="size-4" /></span></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}
    </section>

    <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><div className="flex items-center gap-2"><Link2 className="size-5 text-[#f26a2c]" /><h3 className="font-semibold">Gerar link de indicação</h3></div><p className="mt-1 text-sm text-muted-foreground">Selecione um produto. Seu código será incluído no endereço para identificar a indicação.</p></div>
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto por nome ou SKU…" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
          {catalog.isError ? <p className="text-sm text-destructive">Não foi possível carregar o catálogo real.</p> : catalog.data?.isDemo ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">O catálogo está em modo de demonstração. Configure a origem real antes de compartilhar links de produtos.</p> : null}
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
            {catalog.isPending ? <p className="p-3 text-sm text-muted-foreground">Carregando produtos…</p> : filtered.map((product) => <button key={product.slug} type="button" onClick={() => setSelectedProduct(product.slug)} className={`flex w-full items-center gap-3 rounded-md p-3 text-left transition ${selectedProduct === product.slug ? "bg-orange-50 ring-1 ring-orange-300" : "hover:bg-secondary"}`}><Package className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{product.name}</span><span className="block truncate text-xs text-muted-foreground">{product.sku || product.category}</span></span>{selectedProduct === product.slug && <span className="text-xs font-semibold text-orange-700">Selecionado</span>}</button>)}
            {!catalog.isPending && !filtered.length && <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-xl border bg-secondary/40 p-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seu link exclusivo</p><h4 className="mt-2 font-semibold">{selected?.name || "Selecione um produto"}</h4><p className="mt-2 break-all rounded-lg border bg-background p-3 text-sm text-muted-foreground">{referralUrl || "O link será exibido aqui após selecionar um produto."}</p></div>
          <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={!referralUrl || !!catalog.data?.isDemo || profile?.status !== "active"} onClick={() => void copy(referralUrl, "Link de indicação copiado.")} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Copy className="size-4" /> Copiar link</button>{referralUrl && <a href={referralUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-background"><ExternalLink className="size-4" /> Abrir produto</a>}</div>
        </div>
      </div>
    </section>

    <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Últimas comissões</h3><p className="mt-1 text-sm text-muted-foreground">As comissões só devem ser consideradas definitivas após validação do pagamento e das regras comerciais.</p></div>
      {dashboard.data.commissions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Pedido</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Situação</th></tr></thead><tbody className="divide-y">{dashboard.data.commissions.map((item) => <tr key={item.id}><td className="px-5 py-3 text-muted-foreground">{date(item.created_at)}</td><td className="px-5 py-3">{item.order_id.slice(0,8).toUpperCase()}</td><td className="px-5 py-3 font-medium">{money(Number(item.commission_amount))}</td><td className="px-5 py-3">{item.status}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center"><BadgePercent className="mx-auto size-7 text-muted-foreground/60" /><p className="mt-2 text-sm font-medium">Nenhuma comissão registrada</p><p className="mt-1 text-xs text-muted-foreground">Quando houver uma venda elegível atribuída ao seu link, ela aparecerá aqui.</p></div>}
    </section>
  </div>;
}
