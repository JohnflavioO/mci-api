import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Check, LoaderCircle, Plus, ShieldCheck, Users } from "lucide-react";

const modules = [
  { key: "dashboard", label: "Dashboard" },
  { key: "produtos", label: "Produtos" },
  { key: "estoque", label: "Estoque" },
  { key: "pedidos", label: "Pedidos" },
  { key: "revendedores", label: "Revendedores" },
  { key: "afiliados", label: "Afiliados" },
  { key: "banners", label: "Banners e conteúdo" },
  { key: "configuracoes", label: "Configurações da empresa" },
] as const;
type ModuleKey = typeof modules[number]["key"];
type Action = "view" | "create" | "edit" | "delete";
type Permissions = Partial<Record<ModuleKey, Partial<Record<Action, boolean>>>>;
type AdminRecord = { id: string; email: string; fullName: string; accessLevel: string; permissions: Permissions; createdAt: string | null; emailConfirmedAt: string | null };

const actionLabels: Record<Action, string> = { view: "Ver", create: "Criar", edit: "Editar", delete: "Excluir" };
const defaultPermissions: Permissions = Object.fromEntries(modules.map((m) => [m.key, { view: true }])) as Permissions;

export function AdminPermissionsSection() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<"admin_general" | "operations" | "custom">("custom");
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions);

  const getToken = async () => {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
    return token;
  };
  const administrators = useQuery({
    queryKey: ["admin", "delegated-administrators"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch("/api/admin/administrators", { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({})) as { error?: string; administrators?: AdminRecord[] };
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar os administradores.");
      return body.administrators ?? [];
    },
    retry: false,
  });
  const createAdmin = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const response = await fetch("/api/admin/administrators", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, accessLevel, permissions }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; user?: { email: string } };
      if (!response.ok) throw new Error(body.error || "Não foi possível cadastrar o administrador.");
      return body;
    },
    onSuccess: async () => {
      toast.success("Convite administrativo enviado. O usuário deverá definir a própria senha.");
      setFullName(""); setEmail(""); setShowForm(false);
      await qc.invalidateQueries({ queryKey: ["admin", "delegated-administrators"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setLevel = (level: typeof accessLevel) => {
    setAccessLevel(level);
    if (level === "admin_general") {
      setPermissions(Object.fromEntries(modules.map((m) => [m.key, { view: true, create: true, edit: true, delete: true }])) as Permissions);
    } else if (level === "operations") {
      const operational = new Set(["dashboard", "produtos", "estoque", "pedidos", "revendedores"]);
      setPermissions(Object.fromEntries(modules.map((m) => [m.key, operational.has(m.key) ? { view: true, create: true, edit: true } : { view: false, create: false, edit: false, delete: false }])) as Permissions);
    } else {
      setPermissions(defaultPermissions);
    }
  };

  return <div className="space-y-6">
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="size-5" /></span><div><h2 className="text-lg font-semibold">Administradores e níveis de acesso</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Convide usuários para a área administrativa e defina quais módulos poderão gerenciar. O Super Admin principal continua exclusivo.</p></div></div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"><Plus className="size-4" /> Novo administrador</button>
      </div>
    </section>

    {showForm && <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h3 className="font-semibold">Cadastrar administrador</h3>
      <p className="mt-1 text-sm text-muted-foreground">Um convite será enviado ao e-mail informado. Nenhuma senha será criada ou exibida por este painel.</p>
      <form className="mt-5 space-y-5" onSubmit={(e) => { e.preventDefault(); createAdmin.mutate(); }}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Nome completo<input required maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring" placeholder="Nome do administrador" /></label>
          <label className="text-sm font-medium">E-mail corporativo<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring" placeholder="nome@empresa.com.br" /></label>
        </div>
        <label className="block max-w-md text-sm font-medium">Nível de gerenciamento<select value={accessLevel} onChange={(e) => setLevel(e.target.value as typeof accessLevel)} className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"><option value="custom">Personalizado</option><option value="operations">Administrador de operações</option><option value="admin_general">Administrador geral</option></select></label>
        <div><div className="mb-3"><h4 className="text-sm font-semibold">Permissões por módulo</h4><p className="text-xs text-muted-foreground">Para o nível personalizado, marque somente as ações necessárias.</p></div>
          <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-secondary/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Módulo</th>{(["view","create","edit","delete"] as Action[]).map((a) => <th key={a} className="px-3 py-3 text-center">{actionLabels[a]}</th>)}</tr></thead><tbody className="divide-y">{modules.map((m) => <tr key={m.key}><td className="px-4 py-3 font-medium">{m.label}</td>{(["view","create","edit","delete"] as Action[]).map((a) => <td key={a} className="px-3 py-3 text-center"><input aria-label={`${m.label}: ${actionLabels[a]}`} type="checkbox" checked={permissions[m.key]?.[a] === true} onChange={(e) => setPermissions((old) => ({ ...old, [m.key]: { ...old[m.key], [a]: e.target.checked } }))} className="size-4 accent-primary" /></td>)}</tr>)}</tbody></table></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-lg border px-4 text-sm font-medium">Cancelar</button><button type="submit" disabled={createAdmin.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{createAdmin.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Enviar convite</button></div>
      </form>
    </section>}

    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-5"><h3 className="font-semibold">Administradores cadastrados</h3><p className="mt-1 text-sm text-muted-foreground">Contas delegadas e seus níveis de gerenciamento.</p></div>
      {administrators.isPending ? <div className="p-8 text-sm text-muted-foreground">Carregando administradores…</div> : administrators.isError ? <div className="p-6"><p className="text-sm font-medium">Não foi possível carregar a lista.</p><p className="mt-1 text-sm text-muted-foreground">{administrators.error.message}</p><button type="button" onClick={() => void administrators.refetch()} className="mt-3 text-sm font-semibold underline">Tentar novamente</button></div> : administrators.data.length === 0 ? <div className="p-10 text-center"><Users className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">Nenhum administrador delegado</p><p className="mt-1 text-sm text-muted-foreground">Use “Novo administrador” para enviar o primeiro convite.</p></div> : <div className="divide-y">{administrators.data.map((a) => <article key={a.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-medium">{a.fullName || "Nome não informado"}</p><p className="text-sm text-muted-foreground">{a.email}</p><p className="mt-1 text-xs text-muted-foreground">{a.emailConfirmedAt ? "E-mail confirmado" : "Convite pendente"}</p></div><div className="rounded-full border bg-secondary/50 px-3 py-1.5 text-xs font-semibold">{a.accessLevel === "admin_general" ? "Administrador geral" : a.accessLevel === "operations" ? "Administrador de operações" : "Personalizado"}</div></article>)}</div>}
    </section>
    <p className="text-xs leading-5 text-muted-foreground">A proteção desta área depende também da configuração privada SUPER_ADMIN_USER_ID e SUPABASE_SERVICE_ROLE_KEY no servidor. As permissões são armazenadas no banco; a autorização de cada módulo deve ser aplicada em cada rota/API antes de conceder acesso operacional.</p>
  </div>;
}
