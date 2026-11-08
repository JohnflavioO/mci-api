import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, CreditCard, Package, RefreshCw, Search, ShoppingCart, WalletCards, Trash2, Truck, UserRound, MapPin } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos | MCI Xpress" },
      { name: "description", content: "Acompanhe e gerencie os pedidos da operação comercial MCI." },
    ],
  }),
  component: OrdersPage,
});

type OrderStatus = "pending_payment" | "paid" | "rejected" | "cancelled" | "refund_required" | "refunded";
type OrderItem = { id: string; name_snapshot: string; unit_price: number; qty: number };
type OrderDetails = { id: string; user_id: string; status: OrderStatus; currency: string; total: number; provider: string | null; provider_order_id: string | null; provider_charge_id: string | null; provider_checkout_url: string | null; shipping_amount: number; shipping_provider: string | null; shipping_service: string | null; shipping_cep: string | null; shipping_street: string | null; shipping_number: string | null; shipping_complement: string | null; shipping_district: string | null; shipping_city: string | null; shipping_state: string | null; customer_name: string | null; customer_document: string | null; customer_email: string | null; customer_phone: string | null; refund_reason: string | null; created_at: string; updated_at: string; buyer: { id: string; email: string | null; name: string | null; phone: string | null }; items: (OrderItem & { product_id: string })[] };
type Order = {
  id: string;
  user_id: string;
  status: OrderStatus;
  currency: string;
  total: number;
  provider: string | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
};

const statusMeta: Record<OrderStatus, { label: string; className: string }> = {
  pending_payment: { label: "Aguardando pagamento", className: "bg-amber-100 text-amber-800" },
  paid: { label: "Pago", className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Pagamento recusado", className: "bg-rose-100 text-rose-800" },
  cancelled: { label: "Cancelado", className: "bg-slate-100 text-slate-700" },
  refund_required: { label: "Estorno necessário", className: "bg-red-100 text-red-800" },
  refunded: { label: "Estornado", className: "bg-violet-100 text-violet-800" },
};
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

function isOrdersSchemaMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /relation .*orders.* does not exist|could not find the table .*orders|PGRST205|42P01/i.test(message);
}

function OrdersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const queryClient = useQueryClient();
  const detailsQuery = useQuery({
    queryKey: ["admin", "order-details", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data: sessionData } = await getSupabase().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão administrativa expirada. Entre novamente.");
      const response = await fetch(`/api/admin/orders/${selectedId}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o pedido.");
      return payload.order as OrderDetails;
    },
    retry: false,
  });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) throw new Error("Selecione um pedido.");
      const { data: sessionData } = await getSupabase().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão administrativa expirada. Entre novamente.");
      const response = await fetch(`/api/admin/orders/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword, confirmation: deleteConfirmation }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir o pedido.");
      return payload;
    },
    onSuccess: async () => {
      setDeleteTarget(null); setAdminPassword(""); setDeleteConfirmation(""); setDeleteError(""); setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (error) => setDeleteError(error instanceof Error ? error.message : "Falha ao excluir pedido."),
  });
  const ordersQuery = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("orders")
        .select("id,user_id,status,currency,total,provider,created_at,updated_at,order_items(id,name_snapshot,unit_price,qty)")
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data ?? []) as unknown as Order[];
    },
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const orders = ordersQuery.data ?? [];
  const filtered = useMemo(() => orders.filter((order) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || order.id.toLowerCase().includes(term) || order.user_id.toLowerCase().includes(term) || (order.provider ?? "").toLowerCase().includes(term);
    return matchesSearch && (statusFilter === "all" || order.status === statusFilter);
  }), [orders, search, statusFilter]);
  const selected = detailsQuery.data ?? null;
  const totalPaid = orders.filter((order) => order.status === "paid").reduce((sum, order) => sum + Number(order.total), 0);
  const pending = orders.filter((order) => order.status === "pending_payment").length;
  const needsAttention = orders.filter((order) => order.status === "refund_required").length;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sidebar-primary">Operação comercial</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Gestão de pedidos</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Consulte os dados do comprador, entrega, produtos e pagamento de cada pedido.</p>
        </div>
        <Button variant="outline" onClick={() => void ordersQuery.refetch()} disabled={ordersQuery.isFetching}>
          <RefreshCw className={`mr-2 size-4 ${ordersQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShoppingCart} label="Pedidos encontrados" value={ordersQuery.isPending ? "…" : String(orders.length)} detail="Até 250 registros mais recentes" />
        <Metric icon={Clock3} label="Aguardando pagamento" value={ordersQuery.isPending ? "…" : String(pending)} detail="Não significa pagamento confirmado" />
        <Metric icon={CheckCircle2} label="Total confirmado" value={ordersQuery.isPending ? "…" : money(totalPaid)} detail="Somente pedidos com status pago" />
        <Metric icon={AlertCircle} label="Precisam de atenção" value={ordersQuery.isPending ? "…" : String(needsAttention)} detail="Pedidos que exigem análise de estorno" />
      </section>

      {!ordersQuery.isPending && ordersQuery.isError && isOrdersSchemaMissing(ordersQuery.error) ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-3">
            <WalletCards className="mt-0.5 size-5 shrink-0" />
            <div className="space-y-2">
              <h3 className="font-semibold">A tabela de pedidos não está acessível neste ambiente</h3>
              <p className="text-sm leading-relaxed">A aplicação não conseguiu localizar a tabela <code>public.orders</code>. Confirme que a migration de pedidos foi aplicada no mesmo projeto Supabase usado por esta loja e que o schema cache está atualizado.</p>
              <p className="text-sm leading-relaxed">Se a tabela já existe, verifique as permissões e as políticas RLS da sessão administrativa. A tela permanece somente leitura: não marca pedidos como pagos nem executa cancelamentos ou estornos.</p>
              <Button variant="outline" className="mt-1 border-amber-400 bg-white" onClick={() => void ordersQuery.refetch()}>Verificar novamente</Button>
            </div>
          </div>
        </section>
      ) : null}

      {!ordersQuery.isPending && ordersQuery.isError && !isOrdersSchemaMissing(ordersQuery.error) ? (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 text-destructive" />
            <div><h3 className="font-semibold">Não foi possível carregar os pedidos</h3><p className="mt-1 text-sm text-muted-foreground">Confira a sessão administrativa, as políticas RLS e a disponibilidade do Supabase.</p><p className="mt-2 break-words text-xs text-muted-foreground">{ordersQuery.error.message}</p><Button variant="outline" className="mt-3" onClick={() => void ordersQuery.refetch()}>Tentar novamente</Button></div>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div><h3 className="font-semibold">Lista de pedidos</h3><p className="mt-1 text-xs text-muted-foreground">Abra um pedido para ver os dados completos. Pedidos de teste sem pagamento podem ser excluídos com reautenticação.</p></div>
          <span className="text-sm text-muted-foreground">{filtered.length} resultado(s)</span>
        </div>
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(220px,1fr)_220px]">
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar por pedido, usuário ou provedor" /></div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">Todos os status</option>
            {Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </div>

        {ordersQuery.isPending ? <div className="p-10 text-center text-sm text-muted-foreground">Carregando pedidos…</div> : ordersQuery.isError ? (
          <div className="p-10 text-center text-sm text-muted-foreground">A lista ficará disponível assim que a estrutura de pedidos estiver ativa e acessível.</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-xl bg-muted"><Package className="size-6 text-muted-foreground" /></span>
            <h4 className="mt-4 font-semibold">{orders.length === 0 ? "Nenhum pedido registrado ainda" : "Nenhum pedido encontrado"}</h4>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{orders.length === 0 ? "Quando o checkout estiver conectado e os primeiros pedidos forem registrados, eles aparecerão aqui. Não há pedidos fictícios nesta lista." : "Tente alterar a busca ou selecionar outro status."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Pedido</th><th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Comprador</th><th className="px-4 py-3 font-medium">Itens</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Detalhes</th></tr></thead>
              <tbody className="divide-y">{filtered.map((order) => {
                const meta = statusMeta[order.status] ?? { label: order.status, className: "bg-muted text-muted-foreground" };
                return <tr key={order.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">#{order.id.slice(0, 8).toUpperCase()}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateTime(order.created_at)}</td>
                  <td className="px-4 py-3"><span className="font-medium">Conta {order.user_id.slice(0, 8)}</span><span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{order.user_id}</span></td>
                  <td className="px-4 py-3">{order.order_items?.reduce((sum, item) => sum + item.qty, 0) ?? 0}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">{money(order.total)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span></td>
                  <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}>{selectedId === order.id ? "Fechar" : "Abrir"}</Button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      {selectedId ? <section className="rounded-xl border bg-card p-5 shadow-sm">
        {detailsQuery.isPending ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando detalhes do pedido…</p> : detailsQuery.isError ? <div className="flex items-center justify-between gap-3"><p className="text-sm text-destructive">{detailsQuery.error.message}</p><Button variant="outline" onClick={() => void detailsQuery.refetch()}>Tentar novamente</Button></div> : selected ? <>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Detalhes do pedido</p><h3 className="mt-1 text-lg font-semibold">#{selected.id.toUpperCase()}</h3><p className="mt-1 text-sm text-muted-foreground">Criado em {dateTime(selected.created_at)} · Última atualização {dateTime(selected.updated_at)}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusMeta[selected.status]?.className ?? "bg-muted"}`}>{statusMeta[selected.status]?.label ?? selected.status}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Comprador" value={selected.buyer?.name || selected.customer_name || "Nome não informado"} />
          <Info label="E-mail" value={selected.buyer?.email || selected.customer_email || "Não informado"} />
          <Info label="Telefone" value={selected.buyer?.phone || selected.customer_phone || "Não informado"} />
          <Info label="CPF/CNPJ" value={selected.customer_document || "Não informado"} />
          <Info label="ID da conta" value={selected.user_id} />
          <Info label="Provedor de pagamento" value={selected.provider || "Ainda não definido"} />
          <Info label="ID externo do pagamento" value={selected.provider_order_id || selected.provider_charge_id || "Não disponível"} />
          <Info label="Valor dos produtos + frete" value={money(selected.total)} />
          <Info label="Frete" value={money(selected.shipping_amount)} />
          <Info label="Transportadora" value={selected.shipping_provider ? `${selected.shipping_provider} · ${selected.shipping_service || ""}` : "Não informado"} />
        </div>
        <div className="mt-4 rounded-lg border p-4">
          <h4 className="mb-3 flex items-center gap-2 font-semibold"><MapPin className="size-4" /> Endereço de entrega</h4>
          <p className="text-sm">{[selected.shipping_street, selected.shipping_number, selected.shipping_complement, selected.shipping_district, selected.shipping_city, selected.shipping_state, selected.shipping_cep].filter(Boolean).join(", ") || "Endereço não registrado neste pedido."}</p>
        </div>
        <div className="mt-5"><h4 className="mb-2 font-semibold">Produtos do pedido</h4><div className="divide-y rounded-lg border">{(selected.items ?? []).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{item.name_snapshot}</p><p className="text-xs text-muted-foreground">{item.qty} × {money(item.unit_price)}</p></div><strong>{money(item.qty * item.unit_price)}</strong></div>)}</div></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground"><CreditCard className="mt-0.5 size-4 shrink-0" /> A exclusão é bloqueada para pedidos com pagamento confirmado ou cobrança registrada.</div>
          <Button variant="destructive" onClick={() => { setDeleteTarget(orders.find((o) => o.id === selected.id) ?? null); setDeleteError(""); }} disabled={selected.status === "paid" || selected.status === "refund_required" || selected.status === "refunded" || Boolean(selected.provider_charge_id)}><Trash2 className="mr-2 size-4" /> Excluir pedido</Button>
        </div>
        </> : null}
      </section> : null}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) { setDeleteTarget(null); setAdminPassword(""); setDeleteConfirmation(""); setDeleteError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir pedido de teste?</DialogTitle>
            <DialogDescription>Esta ação é permanente e só é permitida para pedidos sem pagamento confirmado ou cobrança registrada. Informe sua senha administrativa atual para confirmar.</DialogDescription>
          </DialogHeader>
          {deleteTarget ? <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm"><strong>Pedido #{deleteTarget.id.slice(0, 8).toUpperCase()}</strong><p className="text-muted-foreground">{money(deleteTarget.total)} · {statusMeta[deleteTarget.status]?.label ?? deleteTarget.status}</p></div>
            <div><label className="mb-1.5 block text-sm font-medium" htmlFor="admin-delete-password">Senha do administrador</label><Input id="admin-delete-password" type="password" autoComplete="current-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} /></div>
            <div><label className="mb-1.5 block text-sm font-medium" htmlFor="admin-delete-confirmation">Digite EXCLUIR para confirmar</label><Input id="admin-delete-confirmation" value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} /></div>
            {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          </div> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>Voltar</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending || !adminPassword || deleteConfirmation !== "EXCLUIR"}>{deleteMutation.isPending ? "Excluindo…" : "Confirmar exclusão"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-3.5" /> Atualização automática a cada 30 segundos quando o banco está disponível. Exibe até 250 pedidos recentes.</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof ShoppingCart; label: string; value: string; detail: string }) {
  return <article className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><span className="grid size-9 place-items-center rounded-lg bg-muted"><Icon className="size-4" /></span></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm font-medium">{value}</p></div>;
}
