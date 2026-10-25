import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Ban, CheckCircle2, Clock3, RefreshCw, Search, ShieldCheck, Users, UserRoundX } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { toast } from "sonner";

type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
  role: string | null;
  roles?: string[];
};
type UserStatus = "active" | "pending" | "blocked";

const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "—";
const dateOnly = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
const roleLabel = (role: string | null) => {
  if (!role) return "Cliente";
  const labels: Record<string, string> = { admin: "Super Admin", gestor: "Gestor", vendedor: "Vendedor", reseller: "Revendedor", revendedor: "Revendedor", affiliate: "Afiliado", afiliado: "Afiliado", cliente: "Cliente" };
  return labels[role] ?? "Perfil não reconhecido";
};
const statusFor = (user: AdminUser): UserStatus => {
  if (user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now()) return "blocked";
  if (!user.emailConfirmedAt) return "pending";
  return "active";
};
const statusLabel: Record<UserStatus, string> = { active: "Ativo", pending: "E-mail pendente", blocked: "Bloqueado" };
const statusClass: Record<UserStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  blocked: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export function AdminUsersSection() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | UserStatus>("all");
  const queryClient = useQueryClient();
  const accessMutation = useMutation({
    mutationFn: async ({ user, action, reason }: { user: AdminUser; action: "suspend" | "reactivate"; reason: string }) => {
      const session = await getSupabase().auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action, reason }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível alterar o acesso.");
    },
    onSuccess: async (_, variables) => {
      toast.success(variables.action === "suspend" ? "Acesso suspenso." : "Acesso reativado.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "auth-users"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const query = useQuery({
    queryKey: ["admin", "auth-users"],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
      const response = await fetch("/api/admin/users?perPage=100&page=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({})) as { error?: string; users?: AdminUser[]; total?: number | null };
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar os usuários.");
      return { users: body.users ?? [], total: body.total ?? null };
    },
    retry: false,
    staleTime: 30_000,
  });

  const users = query.data?.users ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return users.filter((user) => {
      const matchesSearch = !term || user.email.toLocaleLowerCase("pt-BR").includes(term) || user.fullName.toLocaleLowerCase("pt-BR").includes(term);
      return matchesSearch && (status === "all" || statusFor(user) === status);
    });
  }, [users, search, status]);
  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => statusFor(user) === "active").length,
    pending: users.filter((user) => statusFor(user) === "pending").length,
    blocked: users.filter((user) => statusFor(user) === "blocked").length,
  }), [users]);

  if (query.isPending) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando contas do Supabase Auth…</div>;

  if (query.isError) return (
    <section className="rounded-xl border border-destructive/30 bg-card p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 text-destructive" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Não foi possível carregar os usuários</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{query.error.message}</p>
          <p className="mt-2 text-xs text-muted-foreground">A listagem exige a sessão de Super Admin e a variável privada SUPABASE_SERVICE_ROLE_KEY configurada no servidor. Essa chave nunca deve ser colocada no frontend.</p>
          <button type="button" onClick={() => void query.refetch()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary"><RefreshCw className="size-4" /> Tentar novamente</button>
        </div>
      </div>
    </section>
  );

  const metrics = [
    { label: "Contas encontradas", value: counts.total, icon: Users, detail: "Nesta página de resultados" },
    { label: "Ativos", value: counts.active, icon: CheckCircle2, detail: "E-mail confirmado e sem bloqueio" },
    { label: "E-mail pendente", value: counts.pending, icon: Clock3, detail: "Confirmação ainda não concluída" },
    { label: "Bloqueados", value: counts.blocked, icon: UserRoundX, detail: "Bloqueio temporário ativo" },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, detail }) => (
          <article key={label} className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className="grid size-9 place-items-center rounded-lg bg-secondary"><Icon className="size-4" /></span></div>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-base font-semibold">Contas da plataforma</h2><p className="mt-1 text-sm text-muted-foreground">Consulta somente de leitura das contas registradas no Supabase Auth.</p></div>
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"><RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar lista</button>
        </div>
        <div className="grid gap-3 border-b p-5 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail…" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value as "all" | UserStatus)} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="all">Todas as situações</option><option value="active">Ativos</option><option value="pending">E-mail pendente</option><option value="blocked">Bloqueados</option></select>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center"><Users className="mx-auto size-8 text-muted-foreground/60" /><h3 className="mt-3 font-semibold">Nenhum usuário encontrado</h3><p className="mt-1 text-sm text-muted-foreground">{users.length ? "Tente ajustar a busca ou o filtro." : "Não há contas nesta página do Supabase Auth."}</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Usuário</th><th className="px-5 py-3 font-medium">Perfil</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 font-medium">Último acesso</th><th className="px-5 py-3 font-medium">Cadastro</th><th className="px-5 py-3 text-right font-medium">Ações</th></tr></thead>
            <tbody className="divide-y">{filtered.map((user) => {
              const state = statusFor(user);
              return <tr key={user.id} className="transition-colors hover:bg-secondary/30">
                <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold">{(user.fullName || user.email || "?").slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block font-medium">{user.fullName || "Nome não informado"}</span><span className="block max-w-[280px] truncate text-xs text-muted-foreground">{user.email || "Sem e-mail"}</span></span></div></td>
                <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="size-4" />{roleLabel(user.role)}</span></td>
                <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClass[state]}`}>{statusLabel[state]}</span></td>
                <td className="px-5 py-4 text-muted-foreground">{dateTime(user.lastSignInAt)}</td><td className="px-5 py-4 text-muted-foreground">{dateOnly(user.createdAt)}</td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
        <div className="flex flex-col gap-2 border-t px-5 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Exibindo {filtered.length} de {users.length} contas carregadas.</span><span>Suspensão e reativação exigem motivo e são registradas para auditoria.</span></div>
      </section>
    </div>
  );
}
