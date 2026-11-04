import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BadgePercent, CheckCircle2, Clock3, Coins, Gift, Link2, RefreshCw, Search, Settings2, Trophy, Users, UserRoundX, Wallet } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { saveAffiliateSettings, useAffiliateSettings, type AffiliateSettings } from "@/hooks/useAffiliateSettings";

type AdminAffiliate = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
  role: string | null;
};
type ProgramSettings = AffiliateSettings;
type ProgramData = {
  metrics: { affiliates: number; clicks: number; commissions: number; pendingCommissions: number; commissionTotal: number; redemptions: number };
  affiliates: Array<{ user_id: string; referral_code: string; slug: string | null; commission_rate: number; commission_override_pct: number | null; status: string; clicks30d: number; sales30d: number; pendingCommission: number; points: { performance: number; reward: number } }>;
};
type Tab = "overview" | "settings" | "points" | "commissions";
const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

async function adminToken() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
  return token;
}
async function loadProgram(): Promise<ProgramData> {
  const token = await adminToken();
  const response = await fetch("/api/admin/affiliates", { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({})) as Partial<ProgramData> & { error?: string };
  if (!response.ok) throw new Error(body.error || "Não foi possível carregar o programa de afiliados.");
  return body as ProgramData;
}
async function saveProgram(settings: ProgramSettings) {
  await saveAffiliateSettings(settings);
}

export function AdminAffiliatesSection() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [settings, setSettings] = useState<ProgramSettings | null>(null);
  const affiliateSettingsQuery = useAffiliateSettings();
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ["admin", "affiliates", "users"],
    queryFn: async () => {
      const token = await adminToken();
      const response = await fetch("/api/admin/users?perPage=100&page=1", { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({})) as { error?: string; users?: AdminAffiliate[] };
      if (!response.ok) throw new Error(body.error || "Não foi possível consultar os afiliados.");
      return (body.users ?? []).filter((user) => user.role === "afiliado");
    },
    retry: false,
    staleTime: 30_000,
  });
  const programQuery = useQuery({
    queryKey: ["admin", "affiliates", "program"],
    queryFn: loadProgram,
    retry: false,
    staleTime: 15_000,
  });
  const program = programQuery.data;
  useEffect(() => { if (affiliateSettingsQuery.data) setSettings({ ...affiliateSettingsQuery.data }); }, [affiliateSettingsQuery.data]);
  const saveMutation = useMutation({
    mutationFn: saveProgram,
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin", "affiliates", "program"] }), queryClient.invalidateQueries({ queryKey: ["affiliate_settings"] })]);
      toast.success("Configurações do programa salvas.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const affiliates = usersQuery.data ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return affiliates.filter((item) => !term || item.fullName.toLocaleLowerCase("pt-BR").includes(term) || item.email.toLocaleLowerCase("pt-BR").includes(term));
  }, [affiliates, search]);
  const active = affiliates.filter((item) => { const stat = program?.affiliates.find((x) => x.user_id === item.id); return (!item.bannedUntil || new Date(item.bannedUntil).getTime() <= Date.now()) && !!item.emailConfirmedAt && stat?.status !== "suspended"; }).length;
  const blocked = affiliates.filter((item) => !!item.bannedUntil && new Date(item.bannedUntil).getTime() > Date.now()).length;
  const unconfirmed = affiliates.filter((item) => !item.emailConfirmedAt && (!item.bannedUntil || new Date(item.bannedUntil).getTime() <= Date.now())).length;
  const suspended = (program?.affiliates ?? []).filter((item) => item.status === "suspended").length;

  const tabs: Array<{ id: Tab; label: string; icon: typeof Users }> = [
    { id: "overview", label: "Visão geral", icon: Users },
    { id: "settings", label: "Configurações", icon: Settings2 },
    { id: "points", label: "Pontos e recompensas", icon: Trophy },
    { id: "commissions", label: "Comissões", icon: Wallet },
  ];

  return <div className="space-y-6">
    <section className="rounded-2xl bg-[#171a1f] p-6 text-white sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#ff8a50]">Programa de parceiros</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Gestão de afiliados</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Gerencie indicações, comissões financeiras e dois saldos independentes de pontos: desempenho e recompensas.</p></div>
        <span className="grid size-12 place-items-center rounded-xl bg-[#ff681f]/15 text-[#ff8a50]"><Link2 className="size-6" /></span>
      </div>
    </section>

    <nav className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">
      {tabs.map(({id,label,icon:Icon}) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${tab === id ? "bg-[#171a1f] text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><Icon className="size-4" />{label}</button>)}
    </nav>

    {tab === "overview" && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Afiliados cadastrados", value: usersQuery.isPending ? "—" : affiliates.length, detail: "Contas com perfil de afiliado", icon: Users },
          { label: "Ativos", value: usersQuery.isPending ? "—" : active, detail: "E-mail confirmado e conta liberada", icon: CheckCircle2 },
          { label: "Pendentes", value: usersQuery.isPending ? "—" : unconfirmed, detail: "Aguardando confirmação de e-mail", icon: Clock3 },
          { label: "Suspensos", value: usersQuery.isPending ? "—" : suspended, detail: "Participação suspensa no programa", icon: UserRoundX },
          { label: "Bloqueados", value: usersQuery.isPending ? "—" : blocked, detail: "Conta bloqueada no acesso", icon: UserRoundX },
          { label: "Cliques rastreados (30d)", value: program?.metrics.clicks ?? "—", detail: "Cliques registrados nos últimos 30 dias", icon: Link2 },
        ].map(({label,value,detail,icon:Icon}) => <article key={label} className="rounded-xl border bg-card p-5"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className="grid size-9 place-items-center rounded-lg bg-secondary"><Icon className="size-4" /></span></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}
      </section>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Afiliados cadastrados</h3><p className="mt-1 text-sm text-muted-foreground">Contas identificadas pelo perfil de afiliado no sistema.</p></div><button type="button" onClick={() => { void usersQuery.refetch(); void programQuery.refetch(); }} disabled={usersQuery.isFetching || programQuery.isFetching} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"><RefreshCw className={`size-4 ${usersQuery.isFetching || programQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar</button></div>
        <div className="border-b p-5"><label className="relative block max-w-lg"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail…" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label></div>
        {usersQuery.isError ? <div className="p-6 text-sm text-destructive">{usersQuery.error.message}</div> : filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm"><thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Afiliado</th><th className="px-5 py-3 font-medium">Código / slug</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 font-medium">Cliques (30d)</th><th className="px-5 py-3 font-medium">Vendas (30d)</th><th className="px-5 py-3 font-medium">Comissão pendente</th><th className="px-5 py-3 font-medium">Cadastro</th></tr></thead><tbody className="divide-y">{filtered.map((item) => {const stat = program?.affiliates.find((x) => x.user_id === item.id); const blockedNow = !!item.bannedUntil && new Date(item.bannedUntil).getTime() > Date.now(); const unconfirmedNow = !item.emailConfirmedAt; const status = blockedNow ? "Bloqueado" : unconfirmedNow ? "Pendente" : stat?.status === "suspended" ? "Suspenso" : "Ativo"; return <tr key={item.id} className="hover:bg-secondary/30"><td className="px-5 py-4"><p className="font-medium">{item.fullName || "Nome não informado"}</p><p className="text-xs text-muted-foreground">{item.email}</p></td><td className="px-5 py-4 font-mono text-xs">{stat?.slug || stat?.referral_code || "—"}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === "Ativo" ? "bg-emerald-50 text-emerald-700" : status === "Pendente" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}>{status}</span></td><td className="px-5 py-4 tabular-nums">{stat?.clicks30d ?? 0}</td><td className="px-5 py-4 tabular-nums">{stat?.sales30d ?? 0}</td><td className="px-5 py-4 tabular-nums">{money(stat?.pendingCommission ?? 0)}</td><td className="px-5 py-4 text-muted-foreground">{dateLabel(item.createdAt)}</td></tr>})}</tbody></table></div> : <div className="p-10 text-center"><UserRoundX className="mx-auto size-8 text-muted-foreground/60" /><h3 className="mt-3 font-semibold">{affiliates.length ? "Nenhum resultado encontrado" : "Ainda não há afiliados cadastrados"}</h3><p className="mt-1 text-sm text-muted-foreground">{affiliates.length ? "Tente outro nome ou e-mail." : "Quando uma pessoa concluir o cadastro como afiliado, ela aparecerá nesta lista."}</p></div>}
      </section>
    </>}

    {tab === "settings" && <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Regras gerais do programa</h3><p className="mt-1 text-sm text-muted-foreground">Fonte única das regras aplicadas às novas atribuições e exibidas no painel do afiliado.</p></div>
      {affiliateSettingsQuery.isPending || !settings ? <div className="p-6 text-sm text-muted-foreground">Carregando regras do programa…</div> : affiliateSettingsQuery.isError ? <div className="p-5 text-sm text-destructive">{affiliateSettingsQuery.error.message}</div> : <div className="grid gap-4 p-5 md:grid-cols-2">
        <label className="space-y-1.5 text-sm"><span className="font-medium">Comissão padrão (%)</span><input type="number" min="0" max="100" step="0.01" value={settings.default_commission_pct} onChange={(e) => setSettings((s) => s ? {...s,default_commission_pct:Number(e.target.value)} : s)} className="h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Janela de atribuição (dias)</span><input type="number" min="1" max="365" step="1" value={settings.attribution_window_days} onChange={(e) => setSettings((s) => s ? {...s,attribution_window_days:Number(e.target.value)} : s)} className="h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Modelo de atribuição</span><select value={settings.attribution_model} onChange={(e) => setSettings((s) => s ? {...s,attribution_model:e.target.value as "last_click"} : s)} className="h-10 w-full rounded-md border bg-background px-3"><option value="last_click">Último clique</option></select></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Base de comissão</span><select value={settings.commission_base} onChange={(e) => setSettings((s) => s ? {...s,commission_base:e.target.value as "net"} : s)} className="h-10 w-full rounded-md border bg-background px-3"><option value="net">Líquida (total menos frete, impostos e cupom)</option></select></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Prazo de liberação após pagamento (dias)</span><input type="number" min="1" max="365" step="1" value={settings.grace_days} onChange={(e) => setSettings((s) => s ? {...s,grace_days:Number(e.target.value)} : s)} className="h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Saque mínimo (R$)</span><input type="number" min="0" step="0.01" value={settings.min_withdrawal} onChange={(e) => setSettings((s) => s ? {...s,min_withdrawal:Number(e.target.value)} : s)} className="h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Comissão quando empilhamento bloqueado (%)</span><input type="number" min="0" max="100" step="0.01" value={settings.stacked_commission_pct} onChange={(e) => setSettings((s) => s ? {...s,stacked_commission_pct:Number(e.target.value)} : s)} className="h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Bloquear autoindicação</span><input type="checkbox" checked={settings.block_self_referral} onChange={(e) => setSettings((s) => s ? {...s,block_self_referral:e.target.checked} : s)} className="size-4 accent-orange-600" /></label>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Permitir comissão junto com cupom</span><input type="checkbox" checked={settings.stack_with_coupon} onChange={(e) => setSettings((s) => s ? {...s,stack_with_coupon:e.target.checked} : s)} className="size-4 accent-orange-600" /></label>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Permitir comissão junto com desconto por volume</span><input type="checkbox" checked={settings.stack_with_volume_discount} onChange={(e) => setSettings((s) => s ? {...s,stack_with_volume_discount:e.target.checked} : s)} className="size-4 accent-orange-600" /></label>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Permitir comissão para revendedor</span><input type="checkbox" checked={settings.stack_with_reseller} onChange={(e) => setSettings((s) => s ? {...s,stack_with_reseller:e.target.checked} : s)} className="size-4 accent-orange-600" /></label>
      </div>}
      <div className="flex flex-wrap justify-end gap-2 border-t p-5"><button type="button" onClick={() => {if(affiliateSettingsQuery.data) setSettings({...affiliateSettingsQuery.data});}} disabled={!affiliateSettingsQuery.data} className="h-10 rounded-md border px-4 text-sm font-medium">Descartar</button><button type="button" onClick={() => {if(settings) saveMutation.mutate(settings);}} disabled={!settings || saveMutation.isPending || affiliateSettingsQuery.isError} className="h-10 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50">{saveMutation.isPending ? "Salvando…" : "Salvar configurações"}</button></div>
    </section>}

    {tab === "points" && <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><Trophy className="size-5 text-orange-600" /><h3 className="font-semibold">Pontos de desempenho</h3></div><p className="mt-2 text-sm text-muted-foreground">Pontuação para metas, campanhas, níveis e ranking. Não representa dinheiro e não pode ser sacada.</p><label className="mt-5 block space-y-1.5 text-sm"><span className="font-medium">Pontos por R$ 1,00 em vendas elegíveis</span><input type="number" min="0" step="0.01" value={settings?.performance_points_per_real ?? ""} onChange={(e) => setSettings((s) => s ? ({...s, performance_points_per_real:Number(e.target.value)}) : s)} className="h-10 w-full rounded-md border bg-background px-3" /></label></article>
        <article className="rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><Gift className="size-5 text-orange-600" /><h3 className="font-semibold">Pontos de recompensa</h3></div><p className="mt-2 text-sm text-muted-foreground">Saldo independente para troca por benefícios cadastrados no catálogo de recompensas.</p><label className="mt-5 block space-y-1.5 text-sm"><span className="font-medium">Pontos por R$ 1,00 em vendas elegíveis</span><input type="number" min="0" step="0.01" value={settings?.reward_points_per_real ?? ""} onChange={(e) => setSettings((s) => s ? ({...s, reward_points_per_real:Number(e.target.value)}) : s)} className="h-10 w-full rounded-md border bg-background px-3" /></label><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={settings?.reward_points_enabled ?? false} onChange={(e) => setSettings((s) => s ? ({...s, reward_points_enabled:e.target.checked}) : s)} className="size-4 accent-orange-600" /> Habilitar acúmulo de pontos resgatáveis</label></article>
      </div>
      <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-4 text-sm text-orange-950"><Coins className="mr-2 inline size-4" />Os dois saldos terão extratos separados e lançamentos imutáveis. O resgate dependerá de saldo suficiente, catálogo ativo e aprovação administrativa.</div>
      <div className="flex justify-end"><button type="button" onClick={() => {if(settings) saveMutation.mutate(settings);}} disabled={!settings || saveMutation.isPending || programQuery.isError} className="h-10 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50">{saveMutation.isPending ? "Salvando…" : "Salvar regras de pontos"}</button></div>
    </div>}

    {tab === "commissions" && <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        {[{label:"Comissões registradas",value:program?.metrics.commissions ?? "—",icon:BadgePercent},{label:"Aguardando análise",value:program?.metrics.pendingCommissions ?? "—",icon:Clock3},{label:"Total registrado",value:program ? money(program.metrics.commissionTotal) : "—",icon:Wallet}].map(({label,value,icon:Icon}) => <article key={label} className="rounded-xl border bg-card p-5"><Icon className="size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></article>)}
      </section>
      <section className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Ciclo financeiro</h3><p className="mt-2 text-sm text-muted-foreground">A comissão será criada uma única vez por pedido elegível, após confirmação do pagamento. O fluxo deverá tratar cancelamentos, chargebacks e estornos com lançamentos de reversão, mantendo o histórico original.</p><p className="mt-3 text-xs text-muted-foreground">A estrutura financeira está preparada no banco. A liquidação automática depende da conexão com o processamento de pagamentos e ainda não libera saques nem pagamentos reais.</p></section>
    </div>}
  </div>;
}
