import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BadgePercent, CheckCircle2, Clock3, Link2, RefreshCw, Search, Users, UserRoundX } from "lucide-react";
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

const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));

export function AdminAffiliatesSection() {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["admin", "affiliates"],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
      const response = await fetch("/api/admin/users?perPage=100&page=1", { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({})) as { error?: string; users?: AdminAffiliate[]; total?: number | null };
      if (!response.ok) throw new Error(body.error || "Não foi possível consultar os afiliados.");
      return (body.users ?? []).filter((user) => user.role === "afiliado");
    },
    retry: false,
    staleTime: 30_000,
  });

  const affiliates = query.data ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return affiliates.filter((item) => !term || item.fullName.toLocaleLowerCase("pt-BR").includes(term) || item.email.toLocaleLowerCase("pt-BR").includes(term));
  }, [affiliates, search]);
  const active = affiliates.filter((item) => (!item.bannedUntil || new Date(item.bannedUntil).getTime() <= Date.now()) && !!item.emailConfirmedAt).length;
  const pending = affiliates.length - active;

  if (query.isPending) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando afiliados cadastrados…</div>;
  if (query.isError) return <section className="rounded-xl border border-destructive/30 bg-card p-6"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 size-5 text-destructive" /><div className="min-w-0 flex-1"><h2 className="font-semibold">Não foi possível carregar os afiliados</h2><p className="mt-2 text-sm text-muted-foreground">{query.error.message}</p><p className="mt-2 text-xs text-muted-foreground">A consulta usa a sessão administrativa e a API protegida de usuários.</p><button type="button" onClick={() => void query.refetch()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary"><RefreshCw className="size-4" /> Tentar novamente</button></div></div></section>;

  const metrics = [
    { label: "Afiliados cadastrados", value: affiliates.length, detail: "Contas com perfil de afiliado", icon: Users },
    { label: "Ativos", value: active, detail: "E-mail confirmado e sem bloqueio", icon: CheckCircle2 },
    { label: "Aguardando confirmação", value: pending, detail: "E-mail pendente ou conta bloqueada", icon: Clock3 },
    { label: "Programa", value: "Em estruturação", detail: "Comissões serão ligadas aos pedidos pagos", icon: BadgePercent },
  ];

  return <div className="space-y-6">
    <section className="rounded-2xl bg-[#171a1f] p-6 text-white sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#ff8a50]">Programa de parceiros</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Gestão de afiliados</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Consulte os cadastros, acompanhe a situação das contas e prepare a operação de indicações e comissões.</p></div>
        <span className="grid size-12 place-items-center rounded-xl bg-[#ff681f]/15 text-[#ff8a50]"><Link2 className="size-6" /></span>
      </div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({label,value,detail,icon:Icon}) => <article key={label} className="rounded-xl border bg-card p-5"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className="grid size-9 place-items-center rounded-lg bg-secondary"><Icon className="size-4" /></span></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}</section>
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Afiliados cadastrados</h3><p className="mt-1 text-sm text-muted-foreground">Contas identificadas pelo perfil de afiliado no sistema.</p></div><button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"><RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar</button></div>
      <div className="border-b p-5"><label className="relative block max-w-lg"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail…" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label></div>
      {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Afiliado</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 font-medium">Cadastro</th><th className="px-5 py-3 font-medium">Último acesso</th></tr></thead><tbody className="divide-y">{filtered.map((item) => {const isBlocked = !!item.bannedUntil && new Date(item.bannedUntil).getTime() > Date.now(); const isPending = !item.emailConfirmedAt; return <tr key={item.id} className="hover:bg-secondary/30"><td className="px-5 py-4"><p className="font-medium">{item.fullName || "Nome não informado"}</p><p className="text-xs text-muted-foreground">{item.email}</p></td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${isBlocked ? "bg-rose-50 text-rose-700" : isPending ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{isBlocked ? "Bloqueado" : isPending ? "E-mail pendente" : "Ativo"}</span></td><td className="px-5 py-4 text-muted-foreground">{dateLabel(item.createdAt)}</td><td className="px-5 py-4 text-muted-foreground">{item.lastSignInAt ? dateLabel(item.lastSignInAt) : "Ainda não acessou"}</td></tr>})}</tbody></table></div> : <div className="p-10 text-center"><UserRoundX className="mx-auto size-8 text-muted-foreground/60" /><h3 className="mt-3 font-semibold">{affiliates.length ? "Nenhum resultado encontrado" : "Ainda não há afiliados cadastrados"}</h3><p className="mt-1 text-sm text-muted-foreground">{affiliates.length ? "Tente outro nome ou e-mail." : "Quando uma pessoa concluir o cadastro como afiliado, ela aparecerá nesta lista."}</p></div>}
    </section>
    <section className="rounded-xl border border-orange-200 bg-orange-50/60 p-5 dark:border-orange-900 dark:bg-orange-950/20"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 size-5 text-orange-700 dark:text-orange-300" /><div><h3 className="text-sm font-semibold">Próxima etapa: rastreamento e comissões</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Esta primeira entrega organiza a listagem dos afiliados. O código de indicação, as regras de comissão e a atribuição automática de vendas precisam ser ativados com a migração de banco e a integração do fluxo de pedidos pagos; não há cálculo ou pagamento de comissão nesta tela ainda.</p></div></div></section>
  </div>;
}
