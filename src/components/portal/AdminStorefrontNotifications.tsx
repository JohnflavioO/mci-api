import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, LoaderCircle, X, ShoppingBag, Tag, BellRing } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";

type Kind = "promotion" | "announcement" | "product" | "demo_purchase";
type Audience = "all" | "visitors" | "customers" | "resellers";
type Notification = {
  id: string; kind: Kind; title: string; message: string; product_id: string | null; product_name: string | null;
  image_url: string | null; cta_label: string | null; cta_url: string | null; audience: Audience;
  interval_seconds: number; starts_at: string | null; ends_at: string | null; is_active: boolean;
  sort_order: number; impressions: number; clicks: number; created_at: string;
};
type Product = { id: string; name: string; status: string };
const emptyForm = {
  kind: "promotion" as Kind, title: "", message: "", product_id: "", product_name: "",
  image_url: "", cta_label: "Ver oferta", cta_url: "", audience: "all" as Audience,
  interval_seconds: "30", starts_at: "", ends_at: "", is_active: false, sort_order: "0",
};
const kindLabel: Record<Kind, string> = {
  promotion: "Promoção", announcement: "Aviso comercial", product: "Produto em destaque", demo_purchase: "Compra demonstrativa",
};
const dateValue = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Sem limite";

export function AdminStorefrontNotifications() {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const notifications = useQuery({
    queryKey: ["admin-storefront-notifications"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("storefront_notifications").select("*").order("sort_order").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    staleTime: 10_000,
  });
  const products = useQuery({
    queryKey: ["admin-storefront-notification-products"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("products").select("id,name,status").eq("status", "published").order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    staleTime: 60_000,
  });
  const rows = notifications.data ?? [];
  const metrics = useMemo(() => ({
    active: rows.filter(row => row.is_active && (!row.starts_at || new Date(row.starts_at) <= new Date()) && (!row.ends_at || new Date(row.ends_at) >= new Date())).length,
    impressions: rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0),
    clicks: rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0),
  }), [rows]);

  const reset = () => { setForm(emptyForm); setEditingId(null); setFormOpen(false); };
  const edit = (row: Notification) => {
    setEditingId(row.id);
    setForm({
      kind: row.kind, title: row.title, message: row.message, product_id: row.product_id ?? "",
      product_name: row.product_name ?? "", image_url: row.image_url ?? "", cta_label: row.cta_label ?? "",
      cta_url: row.cta_url ?? "", audience: row.audience, interval_seconds: String(row.interval_seconds),
      starts_at: row.starts_at ? new Date(row.starts_at).toISOString().slice(0, 16) : "",
      ends_at: row.ends_at ? new Date(row.ends_at).toISOString().slice(0, 16) : "",
      is_active: row.is_active, sort_order: String(row.sort_order),
    });
    setFormOpen(true);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (form.title.trim().length < 2 || form.message.trim().length < 2) throw new Error("Preencha o título e a mensagem.");
      if (form.image_url && !form.image_url.startsWith("https://")) throw new Error("A imagem precisa usar uma URL HTTPS.");
      if (form.cta_url && !(form.cta_url.startsWith("/") || form.cta_url.startsWith("https://"))) throw new Error("O link deve ser uma rota interna ou URL HTTPS.");
      if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) throw new Error("O encerramento precisa ser posterior ao início.");
      if (form.kind === "demo_purchase" && !form.message.toLocaleLowerCase("pt-BR").includes("demonstra")) {
        throw new Error("Para transparência, a mensagem de compra demonstrativa precisa informar que é uma demonstração.");
      }
      const selectedProduct = products.data?.find(product => product.id === form.product_id);
      const payload = {
        kind: form.kind, title: form.title.trim(), message: form.message.trim(),
        product_id: form.product_id || null, product_name: selectedProduct?.name || form.product_name.trim() || null,
        image_url: form.image_url.trim() || null, cta_label: form.cta_label.trim() || null, cta_url: form.cta_url.trim() || null,
        audience: form.audience, interval_seconds: Math.max(15, Math.min(180, Number(form.interval_seconds) || 30)),
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        is_active: form.is_active, sort_order: Number(form.sort_order) || 0, updated_at: new Date().toISOString(),
      };
      const sb = getSupabase();
      const request = editingId
        ? await sb.from("storefront_notifications").update(payload).eq("id", editingId)
        : await sb.from("storefront_notifications").insert({ ...payload, created_by: (await sb.auth.getUser()).data.user?.id ?? null });
      if (request.error) throw request.error;
      await qc.invalidateQueries({ queryKey: ["admin-storefront-notifications"] });
      await qc.invalidateQueries({ queryKey: ["storefront-notifications"] });
      toast.success(editingId ? "Notificação atualizada." : "Notificação cadastrada.");
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a notificação.");
    } finally { setSaving(false); }
  };
  const toggle = async (row: Notification) => {
    const { error } = await getSupabase().from("storefront_notifications").update({ is_active: !row.is_active, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success(row.is_active ? "Notificação pausada." : "Notificação ativada."); await qc.invalidateQueries({ queryKey: ["admin-storefront-notifications"] }); }
  };
  const remove = async (row: Notification) => {
    if (!window.confirm(`Excluir a notificação "${row.title}"?`)) return;
    const { error } = await getSupabase().from("storefront_notifications").delete().eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success("Notificação excluída."); await qc.invalidateQueries({ queryKey: ["admin-storefront-notifications"] }); }
  };
  const field = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Marketing comercial</p><h2 className="mt-1 text-2xl font-bold">Notificações da loja</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Gerencie avisos flutuantes de promoções, produtos e prova social. As compras reais são consultadas automaticamente a partir dos pedidos pagos, sem expor o nome do comprador.</p></div>
      <button onClick={() => { reset(); setFormOpen(true); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="size-4"/> Nova notificação</button>
    </header>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Campanhas ativas</p><p className="mt-1 text-2xl font-semibold">{metrics.active}</p></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Exibições registradas</p><p className="mt-1 text-2xl font-semibold">{metrics.impressions.toLocaleString("pt-BR")}</p></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Cliques registrados</p><p className="mt-1 text-2xl font-semibold">{metrics.clicks.toLocaleString("pt-BR")}</p></div>
    </div>

    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><ShoppingBag className="size-5"/></span><div><h3 className="font-semibold">Prova social de compras reais</h3><p className="mt-1 text-sm text-muted-foreground">A loja consulta automaticamente os últimos pedidos com pagamento confirmado nas últimas 48 horas. Exibe somente o produto e, quando disponível, cidade/UF. Nenhum nome, telefone, e-mail ou documento é publicado.</p></div></div>
      <p className="mt-3 text-xs text-muted-foreground">Se não houver pedidos pagos recentes, esta modalidade simplesmente não aparece.</p>
    </section>

    {formOpen && <form onSubmit={save} className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{editingId ? "Editar notificação" : "Cadastrar notificação"}</h3><p className="text-xs text-muted-foreground">A notificação será exibida no canto inferior esquerdo da loja.</p></div><button type="button" onClick={reset} className="rounded-md p-2 hover:bg-secondary" aria-label="Fechar"><X className="size-4"/></button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Tipo<select className={field} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as Kind })}><option value="promotion">Promoção</option><option value="announcement">Aviso comercial</option><option value="product">Produto em destaque</option><option value="demo_purchase">Compra demonstrativa (identificada)</option></select></label>
        <label className="text-sm font-medium">Público<select className={field} value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value as Audience })}><option value="all">Todos os visitantes</option><option value="visitors">Somente visitantes não logados</option><option value="customers">Clientes logados</option><option value="resellers">Revendedores</option></select></label>
        <label className="text-sm font-medium md:col-span-2">Título<input className={field} maxLength={100} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Oferta especial MCI"/></label>
        <label className="text-sm font-medium md:col-span-2">Mensagem<textarea className={field} rows={2} maxLength={240} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Texto curto que aparecerá para o visitante."/></label>
        {form.kind === "demo_purchase" && <p className="md:col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">Mensagens demonstrativas precisam deixar claro que são exemplos ilustrativos. Não as apresente como vendas reais.</p>}
        <label className="text-sm font-medium">Produto relacionado (opcional)<select className={field} value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}><option value="">Nenhum produto</option>{(products.data ?? []).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label className="text-sm font-medium">Nome do produto (se não estiver no catálogo)<input className={field} value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} placeholder="Nome para exibição"/></label>
        <label className="text-sm font-medium">URL da imagem (HTTPS)<input className={field} value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..."/></label>
        <label className="text-sm font-medium">Texto do link<input className={field} maxLength={40} value={form.cta_label} onChange={e => setForm({ ...form, cta_label: e.target.value })} placeholder="Ver produto"/></label>
        <label className="text-sm font-medium md:col-span-2">Link de destino<input className={field} value={form.cta_url} onChange={e => setForm({ ...form, cta_url: e.target.value })} placeholder="/produto/nome-do-produto ou https://..."/></label>
        <label className="text-sm font-medium">Intervalo entre notificações<select className={field} value={form.interval_seconds} onChange={e => setForm({ ...form, interval_seconds: e.target.value })}><option value="15">15 segundos</option><option value="30">30 segundos</option><option value="45">45 segundos</option><option value="60">60 segundos</option><option value="90">90 segundos</option><option value="120">120 segundos</option><option value="180">180 segundos</option></select></label>
        <label className="text-sm font-medium">Ordem de exibição<input type="number" className={field} value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })}/></label>
        <label className="text-sm font-medium">Início (opcional)<input type="datetime-local" className={field} value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })}/></label>
        <label className="text-sm font-medium">Encerramento (opcional)<input type="datetime-local" className={field} value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })}/></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })}/> Publicar quando salvar (respeitando o agendamento)</label>
      <div className="flex flex-wrap gap-2"><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? <LoaderCircle className="size-4 animate-spin"/> : <Save className="size-4"/>}{editingId ? "Salvar alterações" : "Cadastrar notificação"}</button><button type="button" onClick={reset} className="h-10 rounded-lg border px-4 text-sm">Cancelar</button></div>
    </form>}

    <section className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-semibold">Notificações cadastradas</h3><span className="text-xs text-muted-foreground">{rows.length} registro(s)</span></div>
      {notifications.isPending ? <p className="rounded-xl border p-6 text-sm text-muted-foreground">Carregando notificações…</p> : notifications.isError ? <p className="rounded-xl border border-destructive/30 p-5 text-sm text-destructive">Não foi possível carregar. Confirme se sua conta possui acesso administrativo e se a migration foi aplicada.</p> : rows.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma notificação cadastrada. Crie a primeira campanha.</p> : rows.map(row => <article key={row.id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 md:flex-row md:items-center">
        {row.image_url ? <img src={row.image_url} alt="" className="size-16 rounded-lg object-cover"/> : <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-secondary">{row.kind === "promotion" ? <Tag className="size-6"/> : row.kind === "demo_purchase" ? <ShoppingBag className="size-6"/> : <BellRing className="size-6"/>}</span>}
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{row.title}</h4><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{kindLabel[row.kind]}</span><span className={row.is_active ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700" : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"}>{row.is_active ? "Ativa" : "Pausada"}</span></div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{row.message}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Público: {row.audience}</span><span>Intervalo: {row.interval_seconds}s</span><span>Exibições: {Number(row.impressions).toLocaleString("pt-BR")}</span><span>Cliques: {Number(row.clicks).toLocaleString("pt-BR")}</span><span>{dateValue(row.starts_at)} – {dateValue(row.ends_at)}</span></div></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => void toggle(row)} className="h-9 rounded-md border px-3 text-xs font-medium">{row.is_active ? "Pausar" : "Ativar"}</button><button onClick={() => edit(row)} className="h-9 rounded-md border px-3 text-xs font-medium">Editar</button><button onClick={() => void remove(row)} className="grid size-9 place-items-center rounded-md border text-destructive" aria-label="Excluir"><Trash2 className="size-4"/></button></div>
      </article>)}
    </section>
    <p className="text-xs text-muted-foreground">A prova social automática usa exclusivamente pedidos com status pago e janela móvel de 48 horas. Mensagens demonstrativas recebem um selo visível na loja.</p>
  </div>;
}
