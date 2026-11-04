import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BadgePercent, CheckCircle2, Clock3, Coins, Gift, Link2, RefreshCw, Search, Settings2, Trophy, Users, UserRoundX, Wallet } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";

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
type ProgramSettings = {
  enabled: boolean;
  default_commission_rate: number;
  attribution_window_days: number;
  minimum_payout: number;
  performance_points_per_real: number;
  reward_points_per_real: number;
  reward_points_enabled: boolean;
};
type ProgramData = {
  settings: ProgramSettings;
  metrics: { affiliates: number; clicks: number; commissions: number; pendingCommissions: number; commissionTotal: number; redemptions: number };
  affiliates: Array<{ user_id: string; referral_code: string; commission_rate: number; status: string; points: { performance: number; reward: number } }>;
};
type Tab = "overview" | "settings" | "points" | "commissions";
const defaults: ProgramSettings = {
  enabled: false, default_commission_rate: 5, attribution_window_days: 30,
  minimum_payout: 100, performance_points_per_real: 1, reward_points_per_real: 1, reward_points_enabled: true,
};
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
  const token = await adminToken();
  const response = await fetch("/api/admin/affiliates", {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Não foi possível salvar as configurações.");
}

export function AdminAffiliatesSection() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [settings, setSettings] = useState<ProgramSettings>(defaults);
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
  const saveMutation = useMutation({
    mutationFn: saveProgram,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "affiliates", "program"] });
      toast.success("Configurações do programa salvas.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const affiliates = usersQuery.data ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return affiliates.filter((item) => !term || item.fullName.toLocaleLowerCase("pt-BR").includes(term) || item.email.toLocaleLowerCase("pt-BR").includes(term));
  }, [affiliates, search]);
  const active = affiliates.filter((item) => (!item.bannedUntil || new Date(item.bannedUntil).getTime() <= Date.now()) && !!item.emailConfirmedAt).length;
  const pending = affiliates.length - active;

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
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Afiliados cadastrados", value: usersQuery.isPending ? "—" : affiliates.length, detail: "Contas com perfil de afiliado", icon: Users },
          { label: "Ativos", value: usersQuery.isPending ? "—" : active, detail: "E-mail confirmado e sem bloqueio", icon: CheckCircle2 },
          { label: "Aguardando confirmação", value: usersQuery.isPending ? "—" : pending, detail: "E-mail pendente ou conta bloqueada", icon: Clock3 },
          { label: "Cliques rastreados", value: program?.metrics.clicks ?? "—", detail: "Aguardando integração do rastreamento", icon: Link2 },
        ].map(({label,value,detail,icon:Icon}) => <article key={label} className="rounded-xl border bg-card p-5"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className="grid size-9 place-items-center rounded-lg bg-secondary"><Icon className="size-4" /></span></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}
      </section>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Afiliados cadastrados</h3><p className="mt-1 text-sm text-muted-foreground">Contas identificadas pelo perfil de afiliado no sistema.</p></div><button type="button" onClick={() => { void usersQuery.refetch(); void programQuery.refetch(); }} disabled={usersQuery.isFetching || programQuery.isFetching} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"><RefreshCw className={`size-4 ${usersQuery.isFetching || programQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar</button></div>
        <div className="border-b p-5"><label className="relative block max-w-lg"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail…" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label></div>
        {usersQuery.isError ? <div className="p-6 text-sm text-destructive">{usersQuery.error.message}</div> : filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Afiliado</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 font-medium">Cadastro</th><th className="px-5 py-3 font-medium">Último acesso</th></tr></thead><tbody className="divide-y">{filtered.map((item) => {const blocked = !!item.bannedUntil && new Date(item.bannedUntil).getTime() > Date.now(); const unconfirmed = !item.emailConfirmedAt; return <tr key={item.id} className="hover:bg-secondary/30"><td className="px-5 py-4"><p className="font-medium">{item.fullName || "Nome não informado"}</p><p className="text-xs text-muted-foreground">{item.email}</p></td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${blocked ? "bg-rose-50 text-rose-700" : unconfirmed ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{blocked ? "Bloqueado" : unconfirmed ? "E-mail pendente" : "Ativo"}</span></td><td className="px-5 py-4 text-muted-foreground">{dateLabel(item.createdAt)}</td><td className="px-5 py-4 text-muted-foreground">{item.lastSignInAt ? dateLabel(item.lastSignInAt) : "Ainda não acessou"}</td></tr>})}</tbody></table></div> : <div className="p-10 text-center"><UserRoundX className="mx-auto size-8 text-muted-foreground/60" /><h3 className="mt-3 font-semibold">{affiliates.length ? "Nenhum resultado encontrado" : "Ainda não há afiliados cadastrados"}</h3><p className="mt-1 text-sm text-muted-foreground">{affiliates.length ? "Tente outro nome ou e-mail." : "Quando uma pessoa concluir o cadastro como afiliado, ela aparecerá nesta lista."}</p></div>}
      </section>
    </>}

    {tab === "settings" && <section className="rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Regras gerais do programa</h3><p className="mt-1 text-sm text-muted-foreground">Parâmetros globais aplicados às novas atribuições. Alterações não recalculam lançamentos anteriores.</p></div>
      {programQuery.isError ? <div className="m-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle className="mr-2 inline size-4" />{programQuery.error.message}</div> : <div className="space-y-5 p-5">
        <label className="flex items-center justify-between gap-4 rounded-lg border p-4"><span><span className="block text-sm font-semibold">Programa ativo</span><span className="text-xs text-muted-foreground">Habilita novas atribuições quando o rastreamento estiver conectado.</span></span><input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings((s) => ({...s, enabled:e.target.checked}))} className="size-5 accent-orange-600" /></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-sm"><span className="font-medium">Comissão padrão (%)</span><input type="number" min="0" max="100" step="0.01" value={settings.default_commission_rate} onChange={(e) => setSettings((s) => ({...s, default_commission_rate:Number(e.target.value)}))} className="h-10 w-full rounded-md border bg-background px-3" /><span className="text-xs text-muted-foreground">Pode ser substituída por uma regra específica do afiliado ou campanha.</span></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Janela de atribuição (dias)</span><input type="number" min="1" max="365" step="1" value={settings.attribution_window_days} onChange={(e) => setSettings((s) => ({...s, attribution_window_days:Number(e.target.value)}))} className="h-10 w-full rounded-md border bg-background px-3" /><span className="text-xs text-muted-foreground">Prazo entre o clique e a compra para associar a indicação.</span></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Valor mínimo para saque (R$)</span><input type="number" min="0" step="0.01" value={settings.minimum_payout} onChange={(e) => setSettings((s) => ({...s, minimum_payout:Number(e.target.value)}))} className="h-10 w-full rounded-md border bg-background px-3" /><span className="text-xs text-muted-foreground">Limite mínimo do saldo financeiro disponível.</span></label>
        </div>
      </div>}
      <div className="flex flex-wrap justify-end gap-2 border-t p-5"><button type="button" onClick={() => { setSettings(program?.settings ?? defaults); void programQuery.refetch(); }} className="h-10 rounded-md border px-4 text-sm font-medium">Descartar</button><button type="button" disabled={saveMutation.isPending || programQuery.isError} onClick={() => saveMutation.mutate(settings)} className="h-10 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50">{saveMutation.isPending ? "Salvando…" : "Salvar configurações"}</button></div>
    </section>}

    {tab === "points" && <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><Trophy className="size-5 text-orange-600" /><h3 className="font-semibold">Pontos de desempenho</h3></div><p className="mt-2 text-sm text-muted-foreground">Pontuação para metas, campanhas, níveis e ranking. Não representa dinheiro e não pode ser sacada.</p><label className="mt-5 block space-y-1.5 text-sm"><span className="font-medium">Pontos por R$ 1,00 em vendas elegíveis</span><input type="number" min="0" step="0.01" value={settings.performance_points_per_real} onChange={(e) => setSettings((s) => ({...s, performance_points_per_real:Number(e.target.value)}))} className="h-10 w-full rounded-md border bg-background px-3" /></label></article>
        <article className="rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><Gift className="size-5 text-orange-600" /><h3 className="font-semibold">Pontos de recompensa</h3></div><p className="mt-2 text-sm text-muted-foreground">Saldo independente para troca por benefícios cadastrados no catálogo de recompensas.</p><label className="mt-5 block space-y-1.5 text-sm"><span className="font-medium">Pontos por R$ 1,00 em vendas elegíveis</span><input type="number" min="0" step="0.01" value={settings.reward_points_per_real} onChange={(e) => setSettings((s) => ({...s, reward_points_per_real:Number(e.target.value)}))} className="h-10 w-full rounded-md border bg-background px-3" /></label><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.reward_points_enabled} onChange={(e) => setSettings((s) => ({...s, reward_points_enabled:e.target.checked}))} className="size-4 accent-orange-600" /> Habilitar acúmulo de pontos resgatáveis</label></article>
      </div>
      <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-4 text-sm text-orange-950"><Coins className="mr-2 inline size-4" />Os dois saldos terão extratos separados e lançamentos imutáveis. O resgate dependerá de saldo suficiente, catálogo ativo e aprovação administrativa.</div>
      <div className="flex justify-end"><button type="button" onClick={() => saveMutation.mutate(settings)} disabled={saveMutation.isPending || programQuery.isError} className="h-10 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50">{saveMutation.isPending ? "Salvando…" : "Salvar regras de pontos"}</button></div>
    </div>}

    {tab === "commissions" && <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        {[{label:"Comissões registradas",value:program?.metrics.commissions ?? "—",icon:BadgePercent},{label:"Aguardando análise",value:program?.metrics.pendingCommissions ?? "—",icon:Clock3},{label:"Total registrado",value:program ? money(program.metrics.commissionTotal) : "—",icon:Wallet}].map(({label,value,icon:Icon}) => <article key={label} className="rounded-xl border bg-card p-5"><Icon className="size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></article>)}
      </section>
      <section className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Ciclo financeiro</h3><p className="mt-2 text-sm text-muted-foreground">A comissão será criada uma única vez por pedido elegível, após confirmação do pagamento. O fluxo deverá tratar cancelamentos, chargebacks e estornos com lançamentos de reversão, mantendo o histórico original.</p><p className="mt-3 text-xs text-muted-foreground">A estrutura financeira está preparada no banco. A liquidação automática depende da conexão com o processamento de pagamentos e ainda não libera saques nem pagamentos reais.</p></section>
    </div>}
  </div>;
}
