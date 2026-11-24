import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, BadgePercent, Calculator, CheckCircle2, ChevronDown, TrendingUp } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { quoteResellerVolume, volumeTiersFor, type VolumeDiscountRule } from "@/services/volumeDiscounts";
import { formatPrice } from "@/services/catalog";
import type { SupabaseCatalogProduct } from "@/services/supabaseCatalog";

/** Regras ativas de desconto progressivo (compartilhadas entre o simulador e os cards do catálogo). */
export function useResellerVolumeRules() {
  return useQuery({
    queryKey: ["reseller", "volume-discounts"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("reseller_volume_discount_rules").select("id,min_quantity,max_quantity,discount_type,discount_value,is_active,product_ids,badge_label,display_note,is_featured,sort_order,quantity_discounts").eq("is_active", true).order("sort_order").order("min_quantity");
      if (error) throw error;
      return (data ?? []) as VolumeDiscountRule[];
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** Simulador recolhível: escolhe um produto com faixas e mostra preço por unidade e total. */
export function ResellerVolumeDiscountPanel({ products }: { products: SupabaseCatalogProduct[] }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(5);
  const [productId, setProductId] = useState("");
  const query = useResellerVolumeRules();
  const rules = query.data ?? [];
  // Só produtos com preço de revenda e pelo menos uma faixa ativa entram no simulador.
  const eligible = useMemo(() => products.filter((p) => p.resellerPrice != null && volumeTiersFor(rules, p.slug).length > 0), [products, rules]);
  const selected = eligible.find((p) => p.slug === productId) ?? eligible[0];
  const tiers = selected ? volumeTiersFor(rules, selected.slug) : [];
  const quote = selected ? quoteResellerVolume(selected, quantity, rules) : null;
  const plain = selected?.resellerPrice != null ? selected.resellerPrice * quantity : null;
  const nextTier = tiers.find((t) => t.quantity > quantity);
  const money = (v: number) => formatPrice(v, selected?.currency ?? null);
  const applies = (t: (typeof tiers)[number]) => t.perUnit ? quantity >= t.quantity : quantity >= t.quantity && (t.maxQuantity == null || quantity <= t.maxQuantity);

  if (query.isSuccess && eligible.length === 0) return null; // Sem faixas configuradas: não ocupa espaço no catálogo.

  return <section className="overflow-hidden rounded-xl border bg-card">
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-secondary/40 sm:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground"><TrendingUp className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Compre mais, pague menos por unidade</span>
        <span className="block text-xs text-muted-foreground">{query.isPending ? "Carregando condições…" : query.isError ? "As condições progressivas não carregaram agora." : `${eligible.length} ${eligible.length === 1 ? "produto tem" : "produtos têm"} desconto por quantidade. Abra para simular.`}</span>
      </span>
      <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground sm:inline-flex"><Calculator className="size-3.5" />Simulador</span>
      <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && selected && <div className="grid gap-6 border-t p-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] sm:p-6">
      <div className="space-y-4">
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Produto</span><select value={selected.slug} onChange={(e) => setProductId(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3">{eligible.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Quantidade no pedido</span><input type="number" min="1" max="999" step="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))))} className="h-11 w-full rounded-md border bg-background px-3" /></label>
        {quote && plain != null && <div className="rounded-xl border bg-secondary/40 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-muted-foreground">Preço por unidade</p><p className="mt-1 text-lg font-semibold">{money(quote.discountedUnitPrice)}</p></div>
            <div><p className="text-xs text-muted-foreground">Total de {quantity} un.</p><p className="mt-1 text-lg font-bold">{money(quote.totalAfterDiscount)}</p></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{quote.rule ? `Sem a faixa, ${quantity} un. no preço de revenda custariam ${money(plain)}.` : `Nesta quantidade vale o preço de revenda normal (${money(selected.resellerPrice!)} por unidade).`}</p>
        </div>}
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Faixas deste produto</h4>
        {tiers.map((t) => <div key={t.key} className={`flex items-center gap-3 rounded-xl border p-3 ${applies(t) ? "border-emerald-300 bg-emerald-50" : "bg-background"}`}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary"><BadgePercent className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t.label}</p><p className="text-xs text-muted-foreground">{t.discountType === "percentage" ? `${t.discountValue}% sobre o preço de cliente final` : `−${money(t.discountValue)} por unidade`}</p></div>
          {applies(t) && <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />}
        </div>)}
        {nextTier && <p className="flex items-center gap-2 rounded-lg bg-orange-50 p-3 text-sm text-orange-900"><ArrowDownRight className="size-4 shrink-0" />Faltam {nextTier.quantity - quantity} unidade(s) para a próxima faixa.</p>}
      </div>
      <p className="text-xs leading-5 text-muted-foreground lg:col-span-2">O desconto da faixa é aplicado automaticamente no carrinho e no pedido, de acordo com a quantidade de cada produto.</p>
    </div>}
  </section>;
}
