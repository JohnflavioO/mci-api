import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, BadgePercent, Calculator, CheckCircle2, TrendingUp } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { calculateVolumeDiscount, type VolumeDiscountRule } from "@/services/volumeDiscounts";
import { formatPrice } from "@/services/catalog";
import type { SupabaseCatalogProduct } from "@/services/supabaseCatalog";

export function ResellerVolumeDiscountPanel({ products }: { products: SupabaseCatalogProduct[] }) {
  const [quantity, setQuantity] = useState(2);
  const lighting = useMemo(() => products.filter(p => /ilum|luz|light|beam|painel|fresnel|spot/i.test(`${p.category ?? ""} ${p.name}`) && p.resellerPrice != null), [products]);
  const [productId, setProductId] = useState("");
  const query = useQuery({
    queryKey: ["reseller", "volume-discounts"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("reseller_volume_discount_rules").select("id,min_quantity,max_quantity,discount_type,discount_value,is_active").eq("is_active", true).order("min_quantity");
      if (error) throw error;
      return (data ?? []) as VolumeDiscountRule[];
    },
    staleTime: 60_000,
    retry: false,
  });
  const selected = lighting.find(p => p.slug === productId) ?? lighting[0];
  const quote = selected?.resellerPrice != null ? calculateVolumeDiscount(selected.resellerPrice, quantity, query.data ?? []) : null;
  const nextTier = (query.data ?? []).filter(r => r.is_active && r.min_quantity > quantity).sort((a,b) => a.min_quantity-b.min_quantity)[0];
  const money = (v: number) => formatPrice(v, selected?.currency);
  return <section className="overflow-hidden rounded-2xl border bg-card">
    <div className="flex flex-wrap items-start justify-between gap-4 bg-graphite p-5 text-graphite-foreground sm:p-6">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground"><TrendingUp className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand">Benefício para revendedores</p><h3 className="mt-1 text-xl font-bold">Compre mais, economize mais</h3><p className="mt-1 text-sm text-graphite-muted">Veja como a quantidade de luminárias pode melhorar seu preço.</p></div></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-graphite-muted"><Calculator className="size-3.5" /> Simulador de desconto</span>
    </div>
    {query.isError ? <div className="p-5 text-sm text-muted-foreground">As condições progressivas ainda não estão disponíveis.</div> : query.isPending ? <div className="p-5 text-sm text-muted-foreground">Carregando condições…</div> : !(query.data?.length) ? <div className="p-5 text-sm text-muted-foreground">O gestor ainda não configurou faixas de desconto progressivo.</div> : <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] sm:p-6">
      <div className="space-y-4">
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Escolha uma luminária para simular</span><select value={selected?.slug ?? ""} onChange={e=>setProductId(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3" disabled={!lighting.length}>{lighting.map(p=><option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Quantidade no pedido</span><input type="number" min="1" max="999" step="1" value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(999,Math.floor(Number(e.target.value)||1)))} className="h-11 w-full rounded-md border bg-background px-3" /></label>
        {!lighting.length && <p className="text-sm text-muted-foreground">Nenhuma luminária com preço de revenda foi identificada. Confira se a categoria do produto está como Iluminação.</p>}
        {quote && <div className="rounded-xl border bg-secondary/40 p-4"><p className="text-xs text-muted-foreground">Preço de revenda de referência</p><p className="mt-1 text-lg font-semibold">{money(selected!.resellerPrice!)}</p><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-xs text-muted-foreground">Desconto por unidade</p><p className="mt-1 font-semibold text-emerald-700">{quote.unitDiscount > 0 ? "−" + money(quote.unitDiscount) : money(0)}</p></div><div><p className="text-xs text-muted-foreground">Total estimado</p><p className="mt-1 text-lg font-bold">{money(quote.totalAfterDiscount)}</p></div></div><p className="mt-2 text-xs text-muted-foreground">Economia estimada neste exemplo: {money(quote.totalDiscount)}.</p></div>}
      </div>
      <div className="space-y-3"><h4 className="font-semibold">Faixas de desconto</h4>{query.data.map(rule=><div key={rule.id} className={quantity>=rule.min_quantity&&(rule.max_quantity==null||quantity<=rule.max_quantity)?"flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3":"flex items-center gap-3 rounded-xl border bg-background p-3"}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary"><BadgePercent className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{rule.max_quantity==null?rule.min_quantity+"+ luminárias":rule.min_quantity+"–"+rule.max_quantity+" luminárias"}</p><p className="text-xs text-muted-foreground">{rule.discount_type==="percentage"?rule.discount_value+"% de desconto":"−"+money(rule.discount_value)+" por unidade"}</p></div>{quantity>=rule.min_quantity&&(rule.max_quantity==null||quantity<=rule.max_quantity)&&<CheckCircle2 className="size-5 shrink-0 text-emerald-600" />}</div>)}{nextTier&&<p className="flex items-center gap-2 rounded-lg bg-orange-50 p-3 text-sm text-orange-900"><ArrowDownRight className="size-4 shrink-0" />Faltam {nextTier.min_quantity-quantity} unidade(s) para atingir a próxima faixa.</p>}</div>
    </div>}
    <div className="border-t bg-secondary/30 px-5 py-3 text-xs leading-5 text-muted-foreground">Simulação indicativa com base no preço unitário do produto selecionado. A aplicação no pedido depende da integração do cálculo ao serviço de pedidos.</div>
  </section>;
}
