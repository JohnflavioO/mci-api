import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDollarSign, LoaderCircle, Percent, Save, Trash2, TrendingUp, Package, Search, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import type { QuantityDiscountTier, VolumeDiscountRule } from "@/services/volumeDiscounts";

type UnitTierDraft = {
  quantity: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  badge_label: string;
};
type RuleDraft = {
  id?: string;
  discount_mode: "range" | "per_unit";
  quantity_discounts: UnitTierDraft[];
  min_quantity: string;
  max_quantity: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  is_active: boolean;
  product_ids: string[];
  badge_label: string;
  display_note: string;
  is_featured: boolean;
  sort_order: string;
};
const blankRule = (): RuleDraft => ({ discount_mode: "range", quantity_discounts: [], min_quantity: "", max_quantity: "", discount_type: "percentage", discount_value: "", is_active: true, product_ids: [], badge_label: "", display_note: "", is_featured: false, sort_order: "0" });
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AdminProgressiveDiscounts() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<RuleDraft>(blankRule());
  const [productSearch, setProductSearch] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const productsQuery = useQuery({
    queryKey: ["admin", "volume-discount-products"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("products").select("id,name,sku,category,status").eq("status", "published").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; sku: string | null; category: string | null; status: string }[];
    }, retry: false,
  });
  const query = useQuery({
    queryKey: ["admin", "reseller-volume-discounts"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("reseller_volume_discount_rules").select("*").order("min_quantity");
      if (error) throw error;
      return (data ?? []) as VolumeDiscountRule[];
    },
    retry: false,
  });
  const activeRulesCount = query.data?.filter(rule => rule.is_active).length ?? 0;
  const save = useMutation({
    mutationFn: async () => {
      const unitTiers: QuantityDiscountTier[] = draft.quantity_discounts.map(tier => ({
        quantity: Number(tier.quantity),
        discount_type: tier.discount_type,
        discount_value: Number(tier.discount_value.replace(",", ".")),
        badge_label: tier.badge_label.trim() || null,
      })).sort((a, b) => a.quantity - b.quantity);
      const min = draft.discount_mode === "per_unit" ? 2 : Number(draft.min_quantity);
      const max = draft.discount_mode === "per_unit" ? null : (draft.max_quantity.trim() ? Number(draft.max_quantity) : null);
      const value = draft.discount_mode === "per_unit"
        ? Number(unitTiers[0]?.discount_value)
        : Number(draft.discount_value.replace(",", "."));
      if (draft.discount_mode === "per_unit") {
        if (unitTiers.length < 1) throw new Error("Adicione pelo menos uma regra de desconto por unidade.");
        if (unitTiers.some(tier => !Number.isInteger(tier.quantity) || tier.quantity < 2)) throw new Error("A posição da unidade deve ser um número inteiro a partir da 2ª unidade.");
        if (new Set(unitTiers.map(tier => tier.quantity)).size !== unitTiers.length) throw new Error("Não pode haver duas regras para a mesma unidade.");
        if (unitTiers.some(tier => !Number.isFinite(tier.discount_value) || tier.discount_value <= 0)) throw new Error("Informe um desconto maior que zero em todas as unidades configuradas.");
        if (unitTiers.some(tier => tier.discount_type === "percentage" && tier.discount_value > 100)) throw new Error("O percentual de cada unidade não pode ultrapassar 100%.");
      } else {
        if (!Number.isInteger(min) || min < 2) throw new Error("A quantidade mínima deve ser um número inteiro a partir de 2.");
        if (max !== null && (!Number.isInteger(max) || max < min)) throw new Error("A quantidade máxima precisa ser maior ou igual à mínima.");
        if (!Number.isFinite(value) || value <= 0) throw new Error("Informe um desconto maior que zero.");
        if (draft.discount_type === "percentage" && value > 100) throw new Error("O percentual não pode ultrapassar 100%.");
      }
      const existing = query.data ?? [];
      const selectedProducts = new Set(draft.product_ids);
      const conflictingRules = existing.filter(rule => {
        if (rule.id === draft.id || !rule.is_active || !draft.is_active) return false;
        const quantityRangesOverlap = (max === null || rule.min_quantity <= max) &&
          (rule.max_quantity == null || rule.max_quantity >= min);
        const productsOverlap = (rule.product_ids ?? []).some(productId => selectedProducts.has(productId));
        return quantityRangesOverlap && productsOverlap;
      });
      if (conflictingRules.length > 0) {
        const conflictingProducts = [...new Set(conflictingRules.flatMap(rule => (rule.product_ids ?? []).filter(id => selectedProducts.has(id))))];
        const productNames = (productsQuery.data ?? []).filter(product => conflictingProducts.includes(product.id)).map(product => product.name);
        const names = productNames.length ? productNames.join(", ") : "um ou mais produtos selecionados";
        throw new Error(`Há uma faixa ativa com intervalo de quantidade sobreposto para: ${names}. Edite ou pause a faixa existente, ou ajuste a quantidade/produtos.`);
      }
      if (draft.product_ids.length === 0) throw new Error("Selecione pelo menos um produto para esta faixa.");
      if (draft.badge_label.length > 32) throw new Error("O selo deve ter no máximo 32 caracteres.");
      if (draft.display_note.length > 90) throw new Error("O texto auxiliar deve ter no máximo 90 caracteres.");
      const order = Number(draft.sort_order || 0);
      if (!Number.isInteger(order) || order < 0) throw new Error("A ordem de exibição deve ser um inteiro igual ou maior que zero.");
      const payload = { min_quantity: min, max_quantity: max, discount_type: draft.discount_mode === "per_unit" ? (unitTiers[0]?.discount_type ?? "percentage") : draft.discount_type, discount_value: value, quantity_discounts: draft.discount_mode === "per_unit" ? unitTiers : [], is_active: draft.is_active, product_ids: draft.product_ids, badge_label: draft.badge_label.trim() || null, display_note: draft.display_note.trim() || null, is_featured: draft.is_featured, sort_order: order, updated_at: new Date().toISOString() };
      const req = draft.id
        ? getSupabase().from("reseller_volume_discount_rules").update(payload).eq("id", draft.id)
        : getSupabase().from("reseller_volume_discount_rules").insert(payload);
      const { error } = await req;
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Faixa de desconto salva.");
      setDraft(blankRule());
      await qc.invalidateQueries({ queryKey: ["admin", "reseller-volume-discounts"] });
      await qc.invalidateQueries({ queryKey: ["reseller", "volume-discounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pauseAll = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().from("reseller_volume_discount_rules").update({ is_active: false, updated_at: new Date().toISOString() }).eq("is_active", true);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Todas as faixas ativas foram pausadas. Nenhum desconto progressivo será exibido.");
      setDraft(blankRule());
      await qc.invalidateQueries({ queryKey: ["admin", "reseller-volume-discounts"] });
      await qc.invalidateQueries({ queryKey: ["reseller", "volume-discounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await getSupabase().from("reseller_volume_discount_rules").update({ is_active, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      toast.success(variables.is_active ? "Faixa ativada." : "Faixa pausada.");
      await qc.invalidateQueries({ queryKey: ["admin", "reseller-volume-discounts"] });
      await qc.invalidateQueries({ queryKey: ["reseller", "volume-discounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("reseller_volume_discount_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setPendingDeleteId(null);
      toast.success("Faixa removida.");
      // Dispara a atualização em segundo plano para manter a interação responsiva.
      void qc.invalidateQueries({ queryKey: ["admin", "reseller-volume-discounts"] });
      void qc.invalidateQueries({ queryKey: ["reseller", "volume-discounts"] });
    },
    onError: (e: Error) => {
      setPendingDeleteId(null);
      toast.error(e.message);
    },
  });
  const edit = (r: VolumeDiscountRule) => setDraft({ id: r.id, discount_mode: r.quantity_discounts?.length ? "per_unit" : "range", quantity_discounts: (r.quantity_discounts?.length ? r.quantity_discounts : [{ quantity: 2, discount_type: r.discount_type, discount_value: r.discount_value, badge_label: "" }]).map(tier => ({ quantity: String(tier.quantity), discount_type: tier.discount_type, discount_value: String(tier.discount_value), badge_label: tier.badge_label ?? "" })), min_quantity: String(r.min_quantity), max_quantity: r.max_quantity == null ? "" : String(r.max_quantity), discount_type: r.discount_type, discount_value: String(r.discount_value), is_active: r.is_active, product_ids: r.product_ids ?? [], badge_label: r.badge_label ?? "", display_note: r.display_note ?? "", is_featured: r.is_featured ?? false, sort_order: String(r.sort_order ?? 0) });
  const toggleProduct = (id: string) => setDraft(current => ({ ...current, product_ids: current.product_ids.includes(id) ? current.product_ids.filter(x => x !== id) : [...current.product_ids, id] }));
  const visibleProducts = (productsQuery.data ?? []).filter(p => `${p.name} ${p.sku ?? ""} ${p.category ?? ""}`.toLowerCase().includes(productSearch.toLowerCase()));

  return <div className="mx-auto w-full max-w-[1680px] space-y-5">
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="bg-gradient-to-r from-[#17191d] via-[#202329] to-[#292d33] p-6 text-graphite-foreground sm:p-8">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground"><TrendingUp className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Política comercial</p><h2 className="mt-1 text-2xl font-bold">Desconto progressivo por volume</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-graphite-muted">Configure faixas por quantidade de luminárias em um mesmo pedido. O desconto fixo em reais é aplicado por unidade.</p></div></div>
      </div>
      <div className="grid gap-3 bg-muted/20 p-4 sm:grid-cols-3 sm:p-5">
        <div className="rounded-xl border border-border/50 bg-background/90 p-4 shadow-sm"><p className="text-sm text-muted-foreground">Faixas cadastradas</p><p className="mt-2 text-2xl font-bold">{query.data?.length ?? "—"}</p></div>
        <div className="rounded-xl border border-border/50 bg-background/90 p-4 shadow-sm"><p className="text-sm text-muted-foreground">Faixas ativas</p><p className="mt-2 text-2xl font-bold">{query.data?.filter(r => r.is_active).length ?? "—"}</p></div>
        <div className="rounded-xl border border-border/50 bg-background/90 p-4 shadow-sm"><p className="text-sm text-muted-foreground">Modelo de cálculo</p><p className="mt-2 text-sm font-semibold">Maior faixa atingida</p><p className="mt-1 text-xs text-muted-foreground">Sem acumular descontos entre faixas.</p></div>
      </div>
    </section>

    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{draft.id ? "Editar faixa" : "Nova faixa de desconto"}</h3><p className="mt-1 text-sm text-muted-foreground">Exemplo: mínimo 4, máximo 5, desconto de 5% ou R$ 120 por unidade.</p></div>{draft.id && <button type="button" onClick={() => setDraft(blankRule())} className="rounded-md border px-3 py-2 text-sm hover:bg-secondary">Cancelar edição</button>}</div>
      <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <div className="md:col-span-2 xl:col-span-3 rounded-xl border-0 bg-muted/45 p-4">
          <p className="text-sm font-semibold">Modelo de desconto</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setDraft(current => ({ ...current, discount_mode: "range" }))} className={`rounded-xl p-4 text-left transition-all ${draft.discount_mode === "range" ? "border-2 border-foreground bg-background shadow-sm" : "border border-transparent bg-background hover:bg-muted"}`}>
              <span className="block text-sm font-semibold">Faixa de quantidade</span><span className="mt-1 block text-xs text-muted-foreground">A partir de uma quantidade, o mesmo desconto vale para todas as unidades.</span>
            </button>
            <button type="button" onClick={() => setDraft(current => ({ ...current, discount_mode: "per_unit" }))} className={`rounded-xl p-4 text-left transition-all ${draft.discount_mode === "per_unit" ? "border-2 border-foreground bg-background shadow-sm" : "border border-transparent bg-background hover:bg-muted"}`}>
              <span className="block text-sm font-semibold">Desconto por unidade</span><span className="mt-1 block text-xs text-muted-foreground">Configure um desconto para a 2ª unidade, outro para a 3ª, outro para a 4ª e assim por diante.</span>
            </button>
          </div>
        </div>
        {draft.discount_mode === "range" && <>
                  <label className="space-y-1.5 text-sm"><span className="font-medium">Quantidade mínima *</span><input required type="number" min="2" step="1" value={draft.min_quantity} onChange={e => setDraft({...draft,min_quantity:e.target.value})} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder="Ex.: 2" /></label>
        </>}
        {draft.discount_mode === "range" && <label className="space-y-1.5 text-sm"><span className="font-medium">Quantidade máxima</span><input type="number" min={draft.min_quantity || "2"} step="1" value={draft.max_quantity} onChange={e => setDraft({...draft,max_quantity:e.target.value})} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder="Sem limite" /></label>}
        {draft.discount_mode === "range" && <>
                  <label className="space-y-1.5 text-sm"><span className="font-medium">Tipo de desconto *</span><select value={draft.discount_type} onChange={e => setDraft({...draft,discount_type:e.target.value as RuleDraft["discount_type"]})} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"><option value="percentage">Percentual (%)</option><option value="fixed">Valor em reais (R$)</option></select></label>
        </>}
        {draft.discount_mode === "per_unit" && <div className="md:col-span-2 xl:col-span-3 rounded-xl border-0 bg-muted/25 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Desconto individual por posição</p><p className="mt-1 text-sm text-muted-foreground">O desconto incide somente na unidade indicada. A 1ª unidade mantém o preço normal.</p></div><button type="button" onClick={() => setDraft(current => ({ ...current, quantity_discounts: [...current.quantity_discounts, { quantity: String(Math.max(1, ...current.quantity_discounts.map(t => Number(t.quantity) || 1)) + 1), discount_type: "percentage", discount_value: "", badge_label: "" }] }))} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-secondary"><Plus className="size-4" /> Adicionar unidade</button></div>
          <div className="mt-4 space-y-3">
            {draft.quantity_discounts.map((tier, index) => <div key={index} className="grid items-end gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <label className="space-y-1 text-sm"><span className="font-medium">Unidade nº</span><input required type="number" min="2" step="1" value={tier.quantity} onChange={e => setDraft(current => ({ ...current, quantity_discounts: current.quantity_discounts.map((t,i) => i === index ? { ...t, quantity: e.target.value } : t) }))} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder="2" /></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Tipo</span><select value={tier.discount_type} onChange={e => setDraft(current => ({ ...current, quantity_discounts: current.quantity_discounts.map((t,i) => i === index ? { ...t, discount_type: e.target.value as UnitTierDraft["discount_type"] } : t) }))} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"><option value="percentage">Percentual (%)</option><option value="fixed">Valor (R$)</option></select></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Desconto</span><input required type="number" min="0.01" step="0.01" max={tier.discount_type === "percentage" ? 100 : undefined} value={tier.discount_value} onChange={e => setDraft(current => ({ ...current, quantity_discounts: current.quantity_discounts.map((t,i) => i === index ? { ...t, discount_value: e.target.value } : t) }))} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder="Ex.: 10" /></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Selo opcional</span><input maxLength={32} value={tier.badge_label} onChange={e => setDraft(current => ({ ...current, quantity_discounts: current.quantity_discounts.map((t,i) => i === index ? { ...t, badge_label: e.target.value } : t) }))} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder={`${tier.quantity || index + 2}ª unidade`} /></label>
              <button type="button" onClick={() => setDraft(current => ({ ...current, quantity_discounts: current.quantity_discounts.filter((_,i) => i !== index) }))} aria-label="Remover regra da unidade" className="grid size-10 place-items-center rounded-md border text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
            </div>)}
          </div>
          <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">Exemplo: 2ª unidade com 5%, 3ª com 10% e 4ª com R$ 150 de desconto. O carrinho calcula cada unidade separadamente.</div>
        </div>}
        {draft.discount_mode === "range" && <label className="space-y-1.5 text-sm"><span className="font-medium">{draft.discount_type === "percentage" ? "Percentual de desconto (%)" : "Desconto por unidade (R$)"} *</span><div className="relative"><input required type="number" min="0.01" step="0.01" max={draft.discount_type === "percentage" ? 100 : undefined} value={draft.discount_value} onChange={e => setDraft({...draft,discount_value:e.target.value})} className="h-11 w-full rounded-lg border border-border bg-background pl-3 pr-10 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder={draft.discount_type === "percentage" ? "Ex.: 5" : "Ex.: 120"} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{draft.discount_type === "percentage" ? <Percent className="size-4" /> : <CircleDollarSign className="size-4" />}</span></div></label>}
        <label className="space-y-1.5 text-sm"><span className="font-medium">Selo visual (opcional)</span><input maxLength={32} value={draft.badge_label} onChange={e => setDraft({...draft,badge_label:e.target.value})} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder="Ex.: MELHOR PREÇO, MAIS PEDIDO" /><span className="block text-xs text-muted-foreground">Aparece como etiqueta na opção de quantidade.</span></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Texto auxiliar (opcional)</span><input maxLength={90} value={draft.display_note} onChange={e => setDraft({...draft,display_note:e.target.value})} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder="Ex.: Maior economia por unidade" /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Ordem de exibição</span><input type="number" min="0" step="1" value={draft.sort_order} onChange={e => setDraft({...draft,sort_order:e.target.value})} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" placeholder="0" /><span className="block text-xs text-muted-foreground">Menor número aparece primeiro; empate é ordenado pela quantidade mínima.</span></label>
        <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-border/70 bg-muted/25 p-3 text-sm"><input type="checkbox" checked={draft.is_featured} onChange={e => setDraft({...draft,is_featured:e.target.checked})} className="size-4 accent-orange-600" />Destacar esta faixa visualmente</label>
        <div className="md:col-span-2 xl:col-span-3 rounded-xl border-0 bg-muted/25 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2 font-semibold"><Package className="size-4 text-brand" />Produtos participantes *</div><p className="mt-1 text-sm text-muted-foreground">A faixa só será aplicada aos produtos selecionados. Produtos novos não entram automaticamente.</p></div>
            <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">{draft.product_ids.length} selecionado(s)</span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring/20"><Search className="size-4 text-muted-foreground" /><input value={productSearch} onChange={e => setProductSearch(e.target.value)} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar produto por nome, SKU ou categoria" /></div>
          {productsQuery.isPending ? <p className="py-4 text-sm text-muted-foreground">Carregando produtos publicados…</p>
          : productsQuery.isError ? <p className="py-4 text-sm text-destructive">Não foi possível carregar os produtos: {productsQuery.error.message}</p>
          : visibleProducts.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
          : <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
            {visibleProducts.map(product => <label key={product.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${draft.product_ids.includes(product.id) ? "border-brand/70 bg-brand/5 ring-1 ring-brand/20" : "border-transparent bg-card hover:bg-muted/60"}`}>
              <input type="checkbox" checked={draft.product_ids.includes(product.id)} onChange={() => toggleProduct(product.id)} className="mt-1 size-4 accent-orange-600" />
              <span className="min-w-0"><span className="block text-sm font-medium">{product.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{[product.sku ? `SKU ${product.sku}` : null, product.category].filter(Boolean).join(" · ") || "Sem SKU/categoria"}</span></span>
            </label>)}
          </div>}
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setDraft(current => ({...current, product_ids: [...new Set([...current.product_ids, ...visibleProducts.map(p => p.id)])]}))} className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">Selecionar resultados</button><button type="button" onClick={() => setDraft(current => ({...current, product_ids: current.product_ids.filter(id => !visibleProducts.some(p => p.id === id))}))} className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">Desmarcar resultados</button></div>
        </div>
        <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-border/70 bg-muted/25 p-3 text-sm"><input type="checkbox" checked={draft.is_active} onChange={e => setDraft({...draft,is_active:e.target.checked})} className="size-4 accent-orange-600" />Faixa ativa para revendedores</label>
        <div className="flex items-end"><button type="submit" disabled={save.isPending} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 disabled:opacity-60">{save.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{save.isPending ? "Salvando…" : "Salvar faixa"}</button></div>
      </form>
    </section>

    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2"><TrendingUp className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Faixas configuradas</h3><span className="text-xs text-muted-foreground">({query.data?.length ?? 0})</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{activeRulesCount} ativa(s)</span></div>
        {activeRulesCount > 0 && <button type="button" disabled={pauseAll.isPending} onClick={() => { if (window.confirm("Pausar TODAS as faixas ativas? Os revendedores deixarão de ver os descontos progressivos, mas as regras permanecerão cadastradas para reativação posterior.")) pauseAll.mutate(); }} className="h-10 rounded-lg border border-destructive/30 bg-background px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-50">{pauseAll.isPending ? "Pausando…" : "Zerar descontos ativos"}</button>}
      </div>
      {query.isPending ? <div className="p-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-2 size-5 animate-spin" />Carregando faixas…</div>
      : query.isError ? <div className="p-6"><p className="font-medium">Não foi possível carregar as faixas.</p><p className="mt-1 text-sm text-muted-foreground">{query.error.message}. Verifique se a migration proposta foi aplicada e se a sessão possui permissão administrativa.</p><button type="button" onClick={() => void query.refetch()} className="mt-3 text-sm font-semibold underline">Tentar novamente</button></div>
      : !query.data?.length ? <div className="p-8 text-center"><TrendingUp className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 font-semibold">Nenhuma faixa cadastrada</p><p className="mt-1 text-sm text-muted-foreground">Crie a primeira faixa acima. Ela ficará disponível no portal de revenda quando estiver ativa.</p></div>
      : <div className="divide-y">{query.data.map(r => <div key={r.id} className="flex flex-col gap-4 p-5 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:px-6"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Check className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{r.min_quantity}+ unidades {r.badge_label ? `· ${r.badge_label}` : ""}</p><span className={r.is_active ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700" : "rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground"}>{r.is_active ? "Ativa" : "Pausada"}</span></div><p className="mt-1 text-sm text-muted-foreground">{r.quantity_discounts?.length ? `Desconto por unidade: ${r.quantity_discounts.slice().sort((a,b) => a.quantity-b.quantity).map(tier => `${tier.quantity}ª: ${tier.discount_type === "percentage" ? `${tier.discount_value}%` : money(tier.discount_value)}`).join(" · ")}` : `${r.max_quantity == null ? "A partir de " + r.min_quantity : r.min_quantity + " a " + r.max_quantity} unidade(s) · ${r.discount_type === "percentage" ? r.discount_value + "%" : money(r.discount_value) + " por unidade"}`} · {(r.product_ids ?? []).length} produto(s) · ordem {r.sort_order ?? 0}{r.is_featured ? " · destaque" : ""}{r.display_note ? " · " + r.display_note : ""}</p></div><div className="flex flex-wrap items-center gap-2">{pendingDeleteId === r.id ? <><span className="text-xs font-medium text-destructive">Excluir esta faixa?</span><button type="button" onClick={() => remove.mutate(r.id)} disabled={remove.isPending} className="rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">{remove.isPending ? "Excluindo…" : "Confirmar"}</button><button type="button" onClick={() => setPendingDeleteId(null)} disabled={remove.isPending} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50">Cancelar</button></> : <><button type="button" onClick={() => edit(r)} className="h-10 rounded-lg border border-border/70 bg-background px-3 text-sm font-medium transition-colors hover:bg-muted">Editar</button><button type="button" onClick={() => toggleActive.mutate({ id: r.id, is_active: !r.is_active })} disabled={toggleActive.isPending} className={`rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50 ${r.is_active ? "text-amber-700 hover:bg-amber-50" : "text-emerald-700 hover:bg-emerald-50"}`}>{r.is_active ? "Pausar" : "Ativar"}</button><button type="button" onClick={() => setPendingDeleteId(r.id)} disabled={remove.isPending} aria-label="Excluir faixa" className="grid size-10 place-items-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50"><Trash2 className="size-4" /></button></>}</div></div>)}</div>}
    </section>
    <p className="text-xs leading-5 text-muted-foreground">Importante: esta tela configura e publica as faixas. A aplicação financeira definitiva no pedido exige que o cálculo seja validado no serviço de criação do pedido; a API de pedidos atual ainda está desativada, então não há cobrança ou pedido com desconto sendo efetivado por esta tela.</p>
  </div>;
}
