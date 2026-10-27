import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, CalendarClock, Check, CircleAlert, LoaderCircle, Plus, Tag, Trash2, X, Search, Package, Layers3 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

type MarketingKind = "promocoes" | "cupons";
type Promotion = {
  id: string; title: string; target_mode?: "all" | "products" | "categories"; description: string | null; discount_type: "percentage" | "fixed";
  discount_value: number; starts_at: string | null; ends_at: string | null; is_active: boolean; created_at: string;
};
type Coupon = {
  id: string; code: string; description: string | null; discount_type: "percentage" | "fixed";
  discount_value: number; usage_limit: number | null; starts_at: string | null; ends_at: string | null;
  is_active: boolean; created_at: string;
};
type RecordItem = Promotion | Coupon;
type TargetMode = "all" | "products" | "categories";
type CatalogItem = { id: string; name: string; brand: string | null; sku: string | null; category: string | null; status: string; product_images?: { url: string; position: number }[] | null };

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "Sem limite";

function Status({ active, startsAt, endsAt }: { active: boolean; startsAt: string | null; endsAt: string | null }) {
  const now = Date.now();
  const future = startsAt ? new Date(startsAt).getTime() > now : false;
  const expired = endsAt ? new Date(endsAt).getTime() < now : false;
  const label = !active ? "Pausada" : future ? "Agendada" : expired ? "Encerrada" : "Ativa";
  const style = label === "Ativa" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : label === "Agendada" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-secondary text-muted-foreground border-border";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${style}`}>{label}</span>;
}

export function AdminMarketingSection({ kind }: { kind: MarketingKind }) {
  const queryClient = useQueryClient();
  const isCoupon = kind === "cupons";
  const table = isCoupon ? "marketing_coupons" : "marketing_promotions";
  const title = isCoupon ? "Cupons de desconto" : "Promoções";
  const description = isCoupon
    ? "Cadastre códigos promocionais e controle validade, valor e limite de utilizações."
    : "Organize campanhas comerciais, com período de validade e desconto definido.";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecordItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [formTarget, setFormTarget] = useState<{ mode: TargetMode; productIds: string[]; categories: string[] }>({ mode: "all", productIds: [], categories: [] });
  const catalogQuery = useQuery({ queryKey: ["admin-marketing-catalog-targets"], enabled: !isCoupon && formOpen, queryFn: async () => { const { data, error } = await getSupabase().from("products").select("id,name,brand,sku,category,status,product_images(url,position)").order("name", { ascending: true }); if (error) throw error; return (data ?? []) as CatalogItem[]; }, staleTime: 30_000, retry: 1 });
  const catalogProducts = catalogQuery.data ?? [];
  const catalogCategories = useMemo(() => [...new Set(catalogProducts.map(p => p.category?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [catalogProducts]);
  const filteredProducts = useMemo(() => { const term = targetSearch.trim().toLocaleLowerCase("pt-BR"); return catalogProducts.filter(p => !term || [p.name, p.brand, p.sku, p.category].some(v => v?.toLocaleLowerCase("pt-BR").includes(term))); }, [catalogProducts, targetSearch]);
  const [form, setForm] = useState({
    name: "", code: "", description: "", discount_type: "percentage" as "percentage" | "fixed",
    discount_value: "10", usage_limit: "", starts_at: "", ends_at: "", is_active: true,
  });

  const query = useQuery({
    queryKey: ["admin-marketing", table],
    queryFn: async () => {
      const { data, error } = await getSupabase().from(table).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RecordItem[];
    },
    staleTime: 15_000,
    retry: 1,
  });
  const items = query.data ?? [];
  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.is_active && (!item.starts_at || new Date(item.starts_at).getTime() <= Date.now()) && (!item.ends_at || new Date(item.ends_at).getTime() >= Date.now())).length,
    scheduled: items.filter((item) => item.is_active && item.starts_at && new Date(item.starts_at).getTime() > Date.now()).length,
  }), [items]);

  function resetForm() {
    setForm({ name: "", code: "", description: "", discount_type: "percentage", discount_value: "10", usage_limit: "", starts_at: "", ends_at: "", is_active: true });
    setEditing(null); setFormOpen(false); setError(""); setTargetSearch(""); setFormTarget({ mode: "all", productIds: [], categories: [] });
  }
  async function startEdit(item: RecordItem) {
    setEditing(item);
    setForm({
      name: "title" in item ? item.title : "",
      code: "code" in item ? item.code : "",
      description: item.description ?? "",
      discount_type: item.discount_type,
      discount_value: String(item.discount_value),
      usage_limit: "usage_limit" in item && item.usage_limit != null ? String(item.usage_limit) : "",
      starts_at: item.starts_at ? item.starts_at.slice(0, 16) : "",
      ends_at: item.ends_at ? item.ends_at.slice(0, 16) : "",
      is_active: item.is_active,
    });
    setFormTarget({ mode: "all", productIds: [], categories: [] });
    let targetError = false;
    if (!isCoupon) { const sb = getSupabase(); const [target, categories] = await Promise.all([sb.from("marketing_promotion_products").select("product_id").eq("promotion_id", item.id), sb.from("marketing_promotion_categories").select("category").eq("promotion_id", item.id)]); if (target.error || categories.error) { targetError = true; } else if ((target.data?.length ?? 0) > 0) { setFormTarget({ mode: "products", productIds: (target.data ?? []).map((row: { product_id: string }) => row.product_id), categories: [] }); } else if ((categories.data?.length ?? 0) > 0) { setFormTarget({ mode: "categories", productIds: [], categories: (categories.data ?? []).map((row: { category: string }) => row.category) }); } else { setFormTarget({ mode: item.target_mode ?? "all", productIds: [], categories: [] }); } }
    setFormOpen(true); setError(targetError ? "Não foi possível carregar os vínculos. Verifique se a migration foi executada." : ""); setNotice("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const value = Number(form.discount_value);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Informe um desconto maior que zero.");
      if (form.discount_type === "percentage" && value > 100) throw new Error("O desconto percentual não pode ultrapassar 100%.");
      if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) throw new Error("A data final precisa ser posterior à data inicial.");
      if (!isCoupon && formTarget.mode === "products" && formTarget.productIds.length === 0) throw new Error("Selecione pelo menos um produto.");
      if (!isCoupon && formTarget.mode === "categories" && formTarget.categories.length === 0) throw new Error("Selecione pelo menos uma categoria.");
      const payload = {
        ...(isCoupon ? { code: form.code.trim().toUpperCase() } : { title: form.name.trim(), target_mode: formTarget.mode }),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: value,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        is_active: form.is_active,
        ...(isCoupon ? { usage_limit: form.usage_limit ? Math.max(1, Math.floor(Number(form.usage_limit))) : null } : {}),
      };
      if (isCoupon && !/^[A-Z0-9_-]{3,40}$/.test(form.code.trim().toUpperCase())) throw new Error("Use um código de 3 a 40 caracteres: letras, números, hífen ou sublinhado.");
      if (!isCoupon && !form.name.trim()) throw new Error("Informe o nome da promoção.");
      const sb = getSupabase();
      const result = editing
        ? await sb.from(table).update(payload).eq("id", editing.id)
        : isCoupon ? await sb.from(table).insert(payload) : await sb.from(table).insert(payload).select("id").single();
      if (result.error) throw result.error;
      if (!isCoupon) {
        const promotionId = editing?.id ?? ("data" in result ? String((result.data as { id?: string } | null)?.id ?? "") : "");
        if (!promotionId) throw new Error("Não foi possível recuperar o ID da promoção para salvar os vínculos.");
        const [rp, rc] = await Promise.all([sb.from("marketing_promotion_products").delete().eq("promotion_id", promotionId), sb.from("marketing_promotion_categories").delete().eq("promotion_id", promotionId)]);
        if (rp.error || rc.error) throw rp.error ?? rc.error;
        if (formTarget.mode === "products") { const { error: linkError } = await sb.from("marketing_promotion_products").insert(formTarget.productIds.map(product_id => ({ promotion_id: promotionId, product_id }))); if (linkError) throw linkError; }
        if (formTarget.mode === "categories") { const { error: linkError } = await sb.from("marketing_promotion_categories").insert(formTarget.categories.map(category => ({ promotion_id: promotionId, category }))); if (linkError) throw linkError; }
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing", table] });
      setNotice(editing ? "Alterações salvas." : isCoupon ? "Cupom cadastrado." : "Promoção cadastrada.");
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.");
    } finally { setSaving(false); }
  }
  async function toggle(item: RecordItem) {
    setError(""); setNotice("");
    const { error } = await getSupabase().from(table).update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) { setError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["admin-marketing", table] });
    setNotice(item.is_active ? "Item pausado." : "Item ativado.");
  }
  async function remove(item: RecordItem) {
    const label = "title" in item ? item.title : item.code;
    if (!window.confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return;
    const { error } = await getSupabase().from(table).delete().eq("id", item.id);
    if (error) { setError(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["admin-marketing", table] });
    setNotice("Item excluído.");
  }

  return <div className="space-y-6">
    <section className="rounded-xl border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-600"><BadgePercent className="size-5" /></span>
          <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-orange-600">Marketing comercial</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p></div>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: "", code: "", description: "", discount_type: "percentage", discount_value: "10", usage_limit: "", starts_at: "", ends_at: "", is_active: true }); setFormTarget({ mode: "all", productIds: [], categories: [] }); setTargetSearch(""); setFormOpen(true); setError(""); setNotice(""); }} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"><Plus className="size-4" /> Novo {isCoupon ? "cupom" : "promoção"}</button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Total cadastrado</p><p className="mt-1 text-2xl font-semibold">{query.isPending ? "—" : stats.total}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Ativos agora</p><p className="mt-1 text-2xl font-semibold">{query.isPending ? "—" : stats.active}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Agendados</p><p className="mt-1 text-2xl font-semibold">{query.isPending ? "—" : stats.scheduled}</p></div>
      </div>
    </section>

    {notice && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="size-4 shrink-0" />{notice}</div>}
    {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" />{error}</div>}

    {formOpen && <section className="rounded-xl border bg-card p-5 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3"><div><h3 className="font-semibold">{editing ? "Editar" : "Cadastrar"} {isCoupon ? "cupom" : "promoção"}</h3><p className="mt-1 text-xs text-muted-foreground">Os dados são salvos no banco; a ativação respeita as datas definidas.</p></div><button onClick={resetForm} aria-label="Fechar formulário" className="rounded-md p-2 hover:bg-secondary"><X className="size-4" /></button></div>
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        {isCoupon ? <label className="space-y-1.5 text-sm"><span className="font-medium">Código do cupom *</span><input required maxLength={40} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="EX.: MCI10" className="h-10 w-full rounded-md border bg-background px-3 uppercase outline-none focus:ring-2 focus:ring-ring" /></label> : <label className="space-y-1.5 text-sm"><span className="font-medium">Nome da promoção *</span><input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Semana da iluminação" className="h-10 w-full rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring" /></label>}
        {!isCoupon && <div className="space-y-3 rounded-lg border bg-muted/20 p-4 md:col-span-2">
          <div><h4 className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="size-4 text-orange-600" />Aplicação da promoção</h4><p className="mt-1 text-xs text-muted-foreground">Escolha os produtos abrangidos por esta campanha.</p></div>
          <div className="grid gap-2 sm:grid-cols-3">{([{value:"all",label:"Todos os produtos",detail:"Campanha geral"},{value:"products",label:"Produtos específicos",detail:"Escolher itens"},{value:"categories",label:"Categorias específicas",detail:"Selecionar categorias"}] as const).map(option => <button type="button" key={option.value} onClick={() => setFormTarget(current => ({...current,mode:option.value}))} className={"rounded-lg border p-3 text-left transition-colors "+(formTarget.mode===option.value?"border-orange-500 bg-orange-50 ring-1 ring-orange-500/20":"bg-background hover:bg-muted")}><span className="block text-sm font-semibold">{option.label}</span><span className="mt-1 block text-xs text-muted-foreground">{option.detail}</span></button>)}</div>
          {formTarget.mode === "products" && <div className="space-y-3"><label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={targetSearch} onChange={e => setTargetSearch(e.target.value)} placeholder="Buscar por produto, marca ou SKU" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" /></label>
            {catalogQuery.isPending ? <p className="text-sm text-muted-foreground">Carregando catálogo…</p> : catalogQuery.isError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar os produtos. Verifique as permissões do catálogo.</p> : <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border bg-background p-2">{filteredProducts.map(product => <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"><input type="checkbox" checked={formTarget.productIds.includes(product.id)} onChange={e => setFormTarget(current => ({...current,productIds:e.target.checked?[...current.productIds,product.id]:current.productIds.filter(id=>id!==product.id)}))} className="size-4 accent-orange-600" /><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded border bg-muted">{product.product_images?.[0]?.url ? <img src={product.product_images[0].url} alt="" className="size-full object-contain" /> : <Package className="size-4 text-muted-foreground" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{product.name}</span><span className="block text-xs text-muted-foreground">{[product.brand,product.sku?"SKU "+product.sku:null,product.category].filter(Boolean).join(" · ")}</span></span><span className="text-xs text-muted-foreground">{product.status==="published"?"Publicado":"Rascunho"}</span></label>)}{filteredProducts.length===0&&<p className="p-4 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>}</div>}<p className="text-xs text-muted-foreground">{formTarget.productIds.length} produto(s) selecionado(s).</p></div>}
          {formTarget.mode === "categories" && <div>{catalogQuery.isPending ? <p className="text-sm text-muted-foreground">Carregando categorias…</p> : catalogCategories.length===0 ? <p className="text-sm text-muted-foreground">Não foram encontradas categorias preenchidas nos produtos cadastrados.</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{catalogCategories.map(category=><label key={category} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background p-3 text-sm"><input type="checkbox" checked={formTarget.categories.includes(category)} onChange={e=>setFormTarget(current=>({...current,categories:e.target.checked?[...current.categories,category]:current.categories.filter(v=>v!==category)}))} className="size-4 accent-orange-600" /><span>{category}</span><span className="ml-auto text-xs text-muted-foreground">{catalogProducts.filter(p=>p.category?.trim()===category).length}</span></label>)}</div>}</div>}
        </div>}
        <label className="space-y-1.5 text-sm"><span className="font-medium">Tipo de desconto *</span><select value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value as "percentage" | "fixed" })} className="h-10 w-full rounded-md border bg-background px-3"><option value="percentage">Percentual (%)</option><option value="fixed">Valor fixo (R$)</option></select></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Desconto *</span><input required type="number" min="0.01" step="0.01" max={form.discount_type === "percentage" ? 100 : undefined} value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })} className="h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Descrição (opcional)</span><input maxLength={240} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Resumo interno da campanha" className="h-10 w-full rounded-md border bg-background px-3" /></label>
        {isCoupon && <label className="space-y-1.5 text-sm"><span className="font-medium">Limite de utilizações</span><input type="number" min="1" step="1" value={form.usage_limit} onChange={e => setForm({ ...form, usage_limit: e.target.value })} placeholder="Sem limite" className="h-10 w-full rounded-md border bg-background px-3" /></label>}
        <label className="space-y-1.5 text-sm"><span className="font-medium">Início (opcional)</span><input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} className="h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Encerramento (opcional)</span><input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} className="h-10 w-full rounded-md border bg-background px-3" /></label>
        <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="size-4 accent-orange-600" />Deixar ativo</label>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4 md:col-span-2"><button type="button" onClick={resetForm} className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-secondary">Cancelar</button><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving && <LoaderCircle className="size-4 animate-spin" />}{saving ? "Salvando…" : "Salvar"}</button></div>
      </form>
    </section>}

    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-4"><Tag className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Registros</h3><span className="text-xs text-muted-foreground">({items.length})</span></div>
      {query.isPending ? <div className="p-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-2 size-5 animate-spin" />Carregando registros…</div>
      : query.isError ? <div className="p-6"><p className="text-sm font-medium">Não foi possível carregar os registros.</p><p className="mt-1 text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : "Verifique a migration e as permissões administrativas."}</p><button onClick={() => void query.refetch()} className="mt-3 text-sm font-semibold underline">Tentar novamente</button></div>
      : items.length === 0 ? <div className="p-10 text-center"><CalendarClock className="mx-auto size-8 text-muted-foreground/60" /><p className="mt-3 text-sm font-medium">Nenhum {isCoupon ? "cupom" : "promoção"} cadastrado</p><p className="mt-1 text-sm text-muted-foreground">Crie o primeiro registro usando o botão acima.</p></div>
      : <div className="divide-y">{items.map(item => {
        const itemLabel = "title" in item ? item.title : item.code;
        const discount = item.discount_type === "percentage" ? `${item.discount_value}%` : money(item.discount_value);
        return <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{itemLabel}</p><Status active={item.is_active} startsAt={item.starts_at} endsAt={item.ends_at} /></div><p className="mt-1 text-sm text-muted-foreground">{item.description || (isCoupon ? "Cupom de desconto" : "Campanha promocional")} · {discount} de desconto</p><p className="mt-1 text-xs text-muted-foreground">De {dateLabel(item.starts_at)} até {dateLabel(item.ends_at)}{"usage_limit" in item && item.usage_limit ? ` · Limite: ${item.usage_limit} usos` : ""}</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => void toggle(item)} className="h-9 rounded-md border px-3 text-xs font-medium hover:bg-secondary">{item.is_active ? "Pausar" : "Ativar"}</button><button onClick={() => void startEdit(item)} className="h-9 rounded-md border px-3 text-xs font-medium hover:bg-secondary">Editar</button><button onClick={() => void remove(item)} aria-label={`Excluir ${itemLabel}`} className="grid size-9 place-items-center rounded-md border text-muted-foreground hover:border-destructive/40 hover:text-destructive"><Trash2 className="size-4" /></button></div>
        </div>;
      })}</div>}
    </section>
  </div>;
}
