import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, ExternalLink, Pencil, Search, Trash2, X, FilePenLine, ShoppingCart, RefreshCw } from "lucide-react";
import { resellerService, statusLabel, type ResellerApplication, type ResellerStatus, type ReviewAction } from "@/services/resellers";
import { EmptyState, ErrorState, LoadingState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/revendedores")({
  head: () => ({
    meta: [
      { title: "Revendedores | MCI Xpress" },
      { name: "description", content: "Aprovação de cadastros de revendedores na Central Administrativa MCI." },
      { property: "og:title", content: "Revendedores | MCI Xpress" },
      { property: "og:description", content: "Aprovação de cadastros de revendedores na Central Administrativa MCI." },
    ],
  }),
  component: ResellersPage,
});

const filters: (ResellerStatus | "")[] = ["pendente", "documentacao_solicitada", "aprovado", "rejeitado", ""];
const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

function ResellersPage() {
  const [status, setStatus] = useState<ResellerStatus | "">("pendente");
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["admin", "resellers", status], queryFn: () => resellerService.list(status || undefined), retry: false });
  const changeRequests = useQuery({ queryKey: ["admin", "reseller-change-requests"], queryFn: async () => { const { data, error } = await getSupabase().from("reseller_change_requests").select("id,user_id,reseller_application_id,requested_fields,current_values,proposed_values,reason,status,admin_note,created_at").order("created_at", { ascending: false }).limit(100); if (error) throw error; return data ?? []; }, retry: false });
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-card p-5"><div><h2 className="flex items-center gap-2 font-semibold"><FilePenLine className="size-5" /> Solicitações de alteração cadastral</h2><p className="mt-1 text-sm text-muted-foreground">Revise os valores atuais e propostos. A aprovação altera os dados oficiais.</p></div>{changeRequests.isPending ? <LoadingState /> : changeRequests.isError ? <ErrorState message={changeRequests.error.message} onRetry={() => void changeRequests.refetch()} /> : changeRequests.data.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma solicitação enviada.</p> : <div className="space-y-3">{changeRequests.data.map((r) => <article key={r.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Solicitação {r.id.slice(0,8)}</strong><span className="rounded-full border px-3 py-1 text-xs">{r.status}</span></div><p className="mt-2 text-sm"><strong>Motivo:</strong> {r.reason}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{r.requested_fields.map((key: string) => <div key={key} className="rounded-md bg-muted/40 p-3 text-sm"><strong>{({company_name:"Razão social",trade_name:"Nome fantasia",cnpj:"CNPJ",state_registration:"Inscrição estadual",uf:"UF fiscal",responsible_name:"Responsável"} as Record<string,string>)[key] ?? key}</strong><p className="mt-1 text-muted-foreground">Atual: {String(r.current_values[key] ?? "—")}</p><p>Proposto: {String(r.proposed_values[key] ?? "—")}</p></div>)}</div><ChangeRequestDecision id={r.id} status={r.status} /></article>)}</div>}</section>
      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div><h2 className="font-semibold">Gestão de revendedores</h2><p className="mt-1 text-sm text-muted-foreground">Consulte, edite os dados cadastrais e remova registros quando necessário.</p></div>
        <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa, CNPJ, responsável..." className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f || "all"} onClick={() => setStatus(f)} className={`rounded-full border px-3 py-1 text-sm ${status === f ? "bg-primary text-primary-foreground" : "bg-card"}`}>
            {f ? statusLabel[f] : "Todos"}
          </button>
        ))}
      </div>
      {q.isPending ? <LoadingState /> : q.isError ? (
        <div className="space-y-3">
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
          <p className="text-sm text-muted-foreground">Requer login com conta que tenha o papel de administrador. <Link to="/entrar" className="underline">Entrar</Link></p>
        </div>
      ) : q.data.filter((a) => [a.company_name, a.trade_name, a.cnpj, a.responsible_name, a.email, a.phone].some((v) => (v ?? "").toLowerCase().includes(search.toLowerCase().trim()))).length === 0 ? <EmptyState title="Nenhum cadastro encontrado." /> : (
        <div className="space-y-4">{q.data.filter((a) => [a.company_name, a.trade_name, a.cnpj, a.responsible_name, a.email, a.phone].some((v) => (v ?? "").toLowerCase().includes(search.toLowerCase().trim()))).map((a) => <ApplicationCard key={a.id} a={a} />)}</div>
      )}
    </div>
  );
}

function ApplicationCard({ a }: { a: ResellerApplication }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [docs, setDocs] = useState(false);
  const [editing, setEditing] = useState(false);
  const purchases = useQuery({
    queryKey: ["admin", "reseller-purchases", a.user_id],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("orders")
        .select("id,status,total,created_at")
        .eq("user_id", a.user_id)
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
    staleTime: 30_000,
  });
  const purchaseOrders = purchases.data ?? [];
  const paidOrders = purchaseOrders.filter((order) => order.status === "paid");
  const paidRevenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const latestOrder = purchaseOrders[0];
  const [form, setForm] = useState({
    company_name: a.company_name, trade_name: a.trade_name ?? "", cnpj: a.cnpj,
    state_registration: a.state_registration, uf: a.uf, responsible_name: a.responsible_name,
    email: a.email, phone: a.phone,
  });
  const editMutation = useMutation({
    mutationFn: () => resellerService.updateApplication(a.id, { ...form, trade_name: form.trade_name || null }),
    onSuccess: async () => { toast.success("Cadastro atualizado."); setEditing(false); await qc.invalidateQueries({ queryKey: ["admin", "resellers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: () => resellerService.deleteApplication(a.id),
    onSuccess: async () => { toast.success("Cadastro excluído."); await qc.invalidateQueries({ queryKey: ["admin", "resellers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const m = useMutation({
    mutationFn: (action: ReviewAction) => resellerService.review(a.id, action, note, docs),
    onSuccess: (s) => { toast.success(`Cadastro: ${statusLabel[s]}`); void qc.invalidateQueries({ queryKey: ["admin", "resellers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const open = a.status === "pendente" || a.status === "documentacao_solicitada";
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{a.company_name}{a.trade_name && <span className="text-muted-foreground"> · {a.trade_name}</span>}</p>
          <p className="text-sm text-muted-foreground">CNPJ {fmtCnpj(a.cnpj)} · IE {a.state_registration} ({a.uf})</p>
          <p className="text-sm text-muted-foreground">{a.responsible_name} · {a.email} · {a.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border px-3 py-1 text-xs font-medium">{statusLabel[a.status]}</span>
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}><Pencil className="mr-1.5 size-3.5" />Editar</Button>
          <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => { if (window.confirm(`Excluir permanentemente o cadastro de ${a.company_name}? Esta ação não pode ser desfeita.`)) deleteMutation.mutate(); }}><Trash2 className="mr-1.5 size-3.5" />Excluir</Button>
        </div>
      </div>
      {editing && <div className="mt-5 rounded-xl border bg-muted/20 p-4">
        <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">Editar cadastro</h3><p className="text-xs text-muted-foreground">Atualize os dados da empresa e do responsável.</p></div><Button size="icon" variant="ghost" onClick={() => setEditing(false)} aria-label="Fechar edição"><X className="size-4" /></Button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["company_name", "Razão social *"], ["trade_name", "Nome fantasia"], ["cnpj", "CNPJ *"], ["state_registration", "Inscrição estadual *"], ["uf", "UF *"], ["responsible_name", "Responsável *"], ["email", "E-mail *"], ["phone", "Telefone *"],
          ] as const).map(([key, label]) => <label key={key} className="space-y-1 text-sm"><span className="font-medium">{label}</span><input value={form[key]} maxLength={key === "uf" ? 2 : key === "cnpj" ? 18 : 200} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring" /></label>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><Button disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>{editMutation.isPending ? "Salvando..." : "Salvar alterações"}</Button><Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button></div>
      </div>}
      <section className="mt-4 rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="size-4" /> Histórico comercial</h3>
            <p className="mt-1 text-xs text-muted-foreground">Pedidos associados à conta deste revendedor.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void purchases.refetch()} disabled={purchases.isFetching}>
            <RefreshCw className={`mr-1.5 size-3.5 ${purchases.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
        {purchases.isPending ? <p className="mt-3 text-sm text-muted-foreground">Carregando histórico de pedidos…</p> : purchases.isError ? (
          <div className="mt-3 text-sm text-muted-foreground">
            <p>Não foi possível consultar os pedidos desta conta.</p>
            <p className="mt-1 text-xs">Confirme se a tabela de pedidos está disponível e se a sessão administrativa tem permissão de leitura.</p>
          </div>
        ) : (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-md bg-background p-3"><span className="block text-xs text-muted-foreground">Pedidos registrados</span><strong className="mt-1 block text-lg">{purchaseOrders.length}</strong></div>
              <div className="rounded-md bg-background p-3"><span className="block text-xs text-muted-foreground">Compras pagas</span><strong className="mt-1 block text-lg">{paidOrders.length}</strong></div>
              <div className="rounded-md bg-background p-3"><span className="block text-xs text-muted-foreground">Total pago confirmado</span><strong className="mt-1 block text-lg">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(paidRevenue)}</strong></div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {latestOrder ? `Último pedido: ${new Date(latestOrder.created_at).toLocaleDateString("pt-BR")} · status: ${latestOrder.status}` : "Este usuário ainda não possui pedidos registrados."}
              {purchaseOrders.length === 250 ? " · Exibindo no máximo os 250 pedidos mais recentes." : ""}
            </p>
          </>
        )}
      </section>
      {a.review_note && <p className="mt-3 text-sm"><span className="font-medium">Observação:</span> {a.review_note}</p>}
      {!editing && <div className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
        <div className="flex items-start gap-2"><Building2 className="mt-0.5 size-4 text-muted-foreground" /><span><span className="block text-xs text-muted-foreground">Empresa / CNPJ</span>{a.company_name}<span className="block text-muted-foreground">{fmtCnpj(a.cnpj)}</span></span></div>
        <div><span className="block text-xs text-muted-foreground">Responsável</span>{a.responsible_name}<span className="block text-muted-foreground">{a.email}</span></div>
        <div><span className="block text-xs text-muted-foreground">Contato / cadastro</span>{a.phone}<span className="block text-muted-foreground">Recebido em {new Date(a.created_at).toLocaleDateString("pt-BR")}</span></div>
      </div>}
      {open && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Confira a situação cadastral em fontes oficiais:{" "}
            <a className="inline-flex items-center gap-1 underline" href="https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp" target="_blank" rel="noreferrer">Receita Federal <ExternalLink className="size-3" /></a>{" · "}
            <a className="inline-flex items-center gap-1 underline" href="http://www.sintegra.gov.br/" target="_blank" rel="noreferrer">SINTEGRA <ExternalLink className="size-3" /></a>
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} />
            Confirmei que CNPJ e IE estão ativos e regulares
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Justificativa (obrigatória para rejeitar ou solicitar documentação)" className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button disabled={m.isPending || !docs} onClick={() => m.mutate("aprovar")}>Aprovar</Button>
            <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate("solicitar_documentos")}>Solicitar documentação</Button>
            <Button variant="destructive" disabled={m.isPending} onClick={() => m.mutate("rejeitar")}>Rejeitar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeRequestDecision({ id, status }: { id: string; status: string }) { const qc = useQueryClient(); const [note, setNote] = useState(""); const m = useMutation({ mutationFn: async (action: "aprovar" | "rejeitar") => { if (action === "rejeitar" && note.trim().length < 5) throw new Error("Informe a justificativa da rejeição (mínimo 5 caracteres)."); const { error } = await getSupabase().rpc("review_reseller_change_request", { p_request_id: id, p_action: action, p_admin_note: note.trim() || null }); if (error) throw new Error(error.message); }, onSuccess: async (_, action) => { toast.success(action === "aprovar" ? "Alteração aprovada." : "Solicitação rejeitada."); await Promise.all([qc.invalidateQueries({ queryKey: ["admin", "reseller-change-requests"] }), qc.invalidateQueries({ queryKey: ["admin", "resellers"] })]); }, onError: (e: Error) => toast.error(e.message) }); if (status !== "pendente") return null; return <div className="mt-4 space-y-3 border-t pt-4"><label className="block space-y-1 text-sm"><span>Observação (obrigatória ao rejeitar)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="min-h-20 w-full rounded-md border bg-background p-3" /></label><div className="flex gap-2"><Button disabled={m.isPending} onClick={() => m.mutate("aprovar")}>Aprovar alteração</Button><Button variant="destructive" disabled={m.isPending || note.trim().length < 5} onClick={() => m.mutate("rejeitar")}>Rejeitar</Button></div></div>; }
