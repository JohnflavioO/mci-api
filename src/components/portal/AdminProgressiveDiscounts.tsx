import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDollarSign, LoaderCircle, Percent, Plus, Save, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import type { VolumeDiscountRule } from "@/services/volumeDiscounts";

type RuleDraft = {
  id?: string;
  min_quantity: string;
  max_quantity: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  is_active: boolean;
};
const blankRule = (): RuleDraft => ({ min_quantity: "", max_quantity: "", discount_type: "percentage", discount_value: "", is_active: true });
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const labelDiscount = (r: Pick<RuleDraft, "discount_type" | "discount_value">) =>
  r.discount_type === "percentage" ? `${r.discount_value || "0"}%` : money(Number(r.discount_value || 0));

export function AdminProgressiveDiscounts() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<RuleDraft>(blankRule());
  const query = useQuery({
    queryKey: ["admin", "reseller-volume-discounts"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("reseller_volume_discount_rules").select("*").order("min_quantity");
      if (error) throw error;
      return (data ?? []) as VolumeDiscountRule[];
    },
    retry: false,
  });
  const save = useMutation({
    mutationFn: async () => {
      const min = Number(draft.min_quantity);
      const max = draft.max_quantity.trim() ? Number(draft.max_quantity) : null;
      const value = Number(draft.discount_value.replace(",", "."));
      if (!Number.isInteger(min) || min < 2) throw new Error("A quantidade mínima deve ser um número inteiro a partir de 2.");
      if (max !== null && (!Number.isInteger(max) || max < min)) throw new Error("A quantidade máxima precisa ser maior ou igual à mínima.");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Informe um desconto maior que zero.");
      if (draft.discount_type === "percentage" && value > 100) throw new Error("O percentual não pode ultrapassar 100%.");
      const existing = query.data ?? [];
      if (existing.some(r => r.id !== draft.id && r.min_quantity === min)) throw new Error("Já existe uma faixa com essa quantidade mínima.");
      const overlap = existing.find(r => r.id !== draft.id && r.is_active && draft.is_active &&
        (max === null || r.min_quantity <= max) && (r.max_quantity == null || r.max_quantity >= min));
      if (overlap) throw new Error("Esta faixa se sobrepõe a outra faixa ativa. Ajuste os limites antes de salvar.");
      const payload = { min_quantity: min, max_quantity: max, discount_type: draft.discount_type, discount_value: value, is_active: draft.is_active, updated_at: new Date().toISOString() };
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
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("reseller_volume_discount_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Faixa removida.");
      await qc.invalidateQueries({ queryKey: ["admin", "reseller-volume-discounts"] });
      await qc.invalidateQueries({ queryKey: ["reseller", "volume-discounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const edit = (r: VolumeDiscountRule) => setDraft({ id: r.id, min_quantity: String(r.min_quantity), max_quantity: r.max_quantity == null ? "" : String(r.max_quantity), discount_type: r.discount_type, discount_value: String(r.discount_value), is_active: r.is_active });

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="bg-graphite p-6 text-graphite-foreground sm:p-8">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground"><TrendingUp className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Política comercial</p><h2 className="mt-1 text-2xl font-bold">Desconto progressivo por volume</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-graphite-muted">Configure faixas por quantidade de luminárias em um mesmo pedido. O desconto fixo em reais é aplicado por unidade.</p></div></div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
        <div className="rounded-xl border bg-background p-4"><p className="text-sm text-muted-foreground">Faixas cadastradas</p><p className="mt-2 text-2xl font-bold">{query.data?.length ?? "—"}</p></div>
        <div className="rounded-xl border bg-background p-4"><p className="text-sm text-muted-foreground">Faixas ativas</p><p className="mt-2 text-2xl font-bold">{query.data?.filter(r => r.is_active).length ?? "—"}</p></div>
        <div className="rounded-xl border bg-background p-4"><p className="text-sm text-muted-foreground">Modelo de cálculo</p><p className="mt-2 text-sm font-semibold">Maior faixa atingida</p><p className="mt-1 text-xs text-muted-foreground">Sem acumular descontos entre faixas.</p></div>
      </div>
    </section>

    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{draft.id ? "Editar faixa" : "Nova faixa de desconto"}</h3><p className="mt-1 text-sm text-muted-foreground">Exemplo: mínimo 4, máximo 5, desconto de 5% ou R$ 120 por unidade.</p></div>{draft.id && <button type="button" onClick={() => setDraft(blankRule())} className="rounded-md border px-3 py-2 text-sm hover:bg-secondary">Cancelar edição</button>}</div>
      <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Quantidade mínima *</span><input required type="number" min="2" step="1" value={draft.min_quantity} onChange={e => setDraft({...draft,min_quantity:e.target.value})} className="h-10 w-full rounded-md border bg-background px-3" placeholder="Ex.: 2" /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Quantidade máxima</span><input type="number" min={draft.min_quantity || "2"} step="1" value={draft.max_quantity} onChange={e => setDraft({...draft,max_quantity:e.target.value})} className="h-10 w-full rounded-md border bg-background px-3" placeholder="Sem limite" /></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Tipo de desconto *</span><select value={draft.discount_type} onChange={e => setDraft({...draft,discount_type:e.target.value as RuleDraft["discount_type"]})} className="h-10 w-full rounded-md border bg-background px-3"><option value="percentage">Percentual (%)</option><option value="fixed">Valor em reais (R$)</option></select></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">{draft.discount_type === "percentage" ? "Percentual de desconto (%)" : "Desconto por unidade (R$)"} *</span><div className="relative"><input required type="number" min="0.01" step="0.01" max={draft.discount_type === "percentage" ? 100 : undefined} value={draft.discount_value} onChange={e => setDraft({...draft,discount_value:e.target.value})} className="h-10 w-full rounded-md border bg-background pl-3 pr-10" placeholder={draft.discount_type === "percentage" ? "Ex.: 5" : "Ex.: 120"} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{draft.discount_type === "percentage" ? <Percent className="size-4" /> : <CircleDollarSign className="size-4" />}</span></div></label>
        <label className="flex items-center gap-2 self-end rounded-lg border p-3 text-sm"><input type="checkbox" checked={draft.is_active} onChange={e => setDraft({...draft,is_active:e.target.checked})} className="size-4 accent-orange-600" />Faixa ativa para revendedores</label>
        <div className="flex items-end"><button type="submit" disabled={save.isPending} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{save.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{save.isPending ? "Salvando…" : "Salvar faixa"}</button></div>
      </form>
    </section>

    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-4"><TrendingUp className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Faixas configuradas</h3><span className="text-xs text-muted-foreground">({query.data?.length ?? 0})</span></div>
      {query.isPending ? <div className="p-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-2 size-5 animate-spin" />Carregando faixas…</div>
      : query.isError ? <div className="p-6"><p className="font-medium">Não foi possível carregar as faixas.</p><p className="mt-1 text-sm text-muted-foreground">{query.error.message}. Verifique se a migration proposta foi aplicada e se a sessão possui permissão administrativa.</p><button type="button" onClick={() => void query.refetch()} className="mt-3 text-sm font-semibold underline">Tentar novamente</button></div>
      : !query.data?.length ? <div className="p-8 text-center"><TrendingUp className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 font-semibold">Nenhuma faixa cadastrada</p><p className="mt-1 text-sm text-muted-foreground">Crie a primeira faixa acima. Ela ficará disponível no portal de revenda quando estiver ativa.</p></div>
      : <div className="divide-y">{query.data.map(r => <div key={r.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700"><Check className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{r.min_quantity}+ luminárias</p><span className={r.is_active ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700" : "rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground"}>{r.is_active ? "Ativa" : "Pausada"}</span></div><p className="mt-1 text-sm text-muted-foreground">{r.max_quantity == null ? "A partir de " + r.min_quantity : r.min_quantity + " a " + r.max_quantity} unidade(s) · {r.discount_type === "percentage" ? r.discount_value + "%" : money(r.discount_value) + " por unidade"}</p></div><div className="flex gap-2"><button type="button" onClick={() => edit(r)} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-secondary">Editar</button><button type="button" onClick={() => { if (window.confirm("Excluir esta faixa de desconto?")) remove.mutate(r.id); }} disabled={remove.isPending} aria-label="Excluir faixa" className="grid size-9 place-items-center rounded-md border text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button></div></div>)}</div>}
    </section>
    <p className="text-xs leading-5 text-muted-foreground">Importante: esta tela configura e publica as faixas. A aplicação financeira definitiva no pedido exige que o cálculo seja validado no serviço de criação do pedido; a API de pedidos atual ainda está desativada, então não há cobrança ou pedido com desconto sendo efetivado por esta tela.</p>
  </div>;
}
