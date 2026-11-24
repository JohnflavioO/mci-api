import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BadgePercent, CheckCircle2, Package, Search, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ProductImage } from "@/components/shop/ProductCard";
import { ErrorState, LoadingState } from "@/components/shop/states";
import { formatPrice } from "@/services/catalog";
import { createSupabaseCatalog, type SupabaseCatalogProduct } from "@/services/supabaseCatalog";
import { getVolumeDiscountRule, quoteResellerVolume, volumeConditionsFor, type VolumeDiscountRule } from "@/services/volumeDiscounts";
import { canSell, useCart } from "@/lib/cart";
import { ResellerVolumeDiscountPanel, useResellerVolumeRules } from "@/components/portal/ResellerVolumeDiscountPanel";

function stockLabel(stock: number | null | undefined) {
  if (stock == null) return { text: "Disponibilidade a confirmar", ok: false };
  if (stock <= 0) return { text: "Sem estoque no momento", ok: false };
  return { text: `${stock} ${stock === 1 ? "unidade disponível" : "unidades disponíveis"}`, ok: true };
}

function ResellerProductCard({ product, rules }: { product: SupabaseCatalogProduct; rules: VolumeDiscountRule[] }) {
  const cart = useCart();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const sellable = canSell(product) && product.resellerPrice != null;
  const margin = product.resellerPrice != null && product.customerPrice != null && product.customerPrice > product.resellerPrice
    ? { value: product.customerPrice - product.resellerPrice, pct: Math.round(((product.customerPrice - product.resellerPrice) / product.customerPrice) * 100) }
    : null;
  // Inclui a regra por unidade (ex.: "2 a 4 unidades") como uma condição, junto das faixas.
  const conditions = volumeConditionsFor(rules, product.slug, (value) => formatPrice(value, product.currency)).slice(0, 3);
  const activeRuleId = getVolumeDiscountRule(qty, rules, product.slug)?.id ?? null;
  const quote = qty > 1 ? quoteResellerVolume(product, qty, rules) : null;
  const stock = stockLabel(product.stock);
  const maxQty = product.stock ?? 1;
  const meta = [product.brand, product.sku ? `SKU ${product.sku}` : null].filter(Boolean).join(" · ");

  const add = () => {
    if (cart.add({ slug: product.slug, name: product.name, image: product.images[0] ?? null, maxQty: product.stock, qty })) {
      toast.success(`${qty} ${qty === 1 ? "unidade adicionada" : "unidades adicionadas"} ao carrinho`, { action: { label: "Ver carrinho", onClick: () => { void navigate({ to: "/carrinho" }); } } });
      setQty(1);
    } else toast.error("A quantidade ultrapassa o estoque disponível.");
  };

  return <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card transition-colors duration-200 hover:border-brand/50">
    <Link to="/produto/$slug" params={{ slug: product.slug }} aria-label={`Ver detalhes de ${product.name}`} className="relative flex h-44 items-center justify-center overflow-hidden border-b border-border/60 bg-white sm:h-48">
      <ProductImage src={product.images[0]} alt={product.name} className="h-full w-full !bg-white object-contain p-3 transition-transform duration-300 group-hover:scale-[1.04]" />
      <span className="absolute left-3 top-3 rounded border border-border/70 bg-white/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{product.category || "Equipamento"}</span>
    </Link>
    <div className="flex flex-1 flex-col p-4">
      <Link to="/produto/$slug" params={{ slug: product.slug }} className="line-clamp-2 min-h-12 text-[15px] font-bold leading-6 tracking-tight hover:text-brand">{product.name}</Link>
      {meta && <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>}

      <div className="mt-3 rounded-lg bg-secondary/50 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand">Seu preço de revenda</p>
        <p className="mt-0.5 text-2xl font-extrabold leading-7 tracking-tight">{product.resellerPrice != null ? formatPrice(product.resellerPrice, product.currency) : "Sob consulta"}</p>
        {product.customerPrice != null && <p className="mt-1 text-xs text-muted-foreground">Cliente final: {formatPrice(product.customerPrice, product.currency)}</p>}
        {margin && <p className="mt-2 inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Margem de {formatPrice(margin.value, product.currency)} por unidade ({margin.pct}%)</p>}
      </div>

      {conditions.length > 0 && <div className="mt-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><BadgePercent className="size-3.5 text-brand" />Desconto por quantidade</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {conditions.map((c) => <button key={c.key} type="button" disabled={!sellable || (product.stock != null && product.stock < c.from)} onClick={() => setQty(c.from)} title={c.detail ?? undefined} className={`rounded-md border px-2 py-1 text-left text-xs transition disabled:opacity-40 ${c.ruleId === activeRuleId ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40"}`}>
            <span className="font-semibold">{c.title}</span> · {c.value}
          </button>)}
        </div>
      </div>}

      <p className={`mt-3 flex items-center gap-1.5 text-xs ${stock.ok ? "text-muted-foreground" : "text-amber-700"}`}>
        {stock.ok ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <span className="size-1.5 rounded-full bg-amber-500" />}{stock.text}
      </p>
      {product.resellerPrice == null && <p className="mt-1 text-xs leading-4 text-muted-foreground">Consulte a equipe comercial para confirmar sua condição.</p>}

      <div className="mt-auto pt-4">
        {quote && <p className="mb-2 text-xs text-muted-foreground">{qty} un. por <strong className="text-foreground">{formatPrice(quote.totalAfterDiscount, product.currency)}</strong> ({formatPrice(quote.discountedUnitPrice, product.currency)}/un.)</p>}
        <div className="flex gap-2">
          <div className="flex h-10 w-[104px] shrink-0 items-center overflow-hidden rounded-md border">
            <button type="button" aria-label="Diminuir quantidade" disabled={!sellable || qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-full w-8 hover:bg-secondary disabled:opacity-40">−</button>
            <input type="number" inputMode="numeric" min={1} max={maxQty} value={qty} disabled={!sellable} aria-label={`Quantidade de ${product.name}`} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); setQty(Number.isFinite(n) ? Math.max(1, Math.min(maxQty, n)) : 1); }} className="h-full min-w-0 flex-1 bg-transparent text-center text-sm font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
            <button type="button" aria-label="Aumentar quantidade" disabled={!sellable || qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="h-full w-8 hover:bg-secondary disabled:opacity-40">+</button>
          </div>
          <button type="button" disabled={!sellable} onClick={add} className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-semibold text-background transition-colors hover:bg-brand hover:text-brand-foreground disabled:opacity-50">
            <ShoppingCart className="size-4" />{sellable ? "Adicionar" : "Indisponível"}
          </button>
        </div>
        <Link to="/produto/$slug" params={{ slug: product.slug }} className="mt-2 inline-flex w-full items-center justify-center gap-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">Ver detalhes do produto <ArrowRight className="size-3.5" /></Link>
      </div>
    </div>
  </article>;
}

export function ResellerCatalog() {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("Todas");
  const query = useQuery({
    queryKey: ["reseller", "catalog"],
    queryFn: () => createSupabaseCatalog().listReseller(),
    staleTime: 30_000,
    retry: 1,
  });
  const rulesQuery = useResellerVolumeRules();
  const rules = rulesQuery.data ?? [];
  const cart = useCart();
  const products = query.data ?? [];
  const categories = useMemo(
    () => ["Todas", ...new Set(products.map((p) => p.category).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR")))],
    [products],
  );
  const filtered = useMemo(() => {
    const q = term.trim().toLocaleLowerCase("pt-BR");
    return products.filter((p) =>
      (category === "Todas" || p.category === category) &&
      (!q || p.name.toLocaleLowerCase("pt-BR").includes(q) ||
        (p.brand ?? "").toLocaleLowerCase("pt-BR").includes(q) ||
        (p.sku ?? "").toLocaleLowerCase("pt-BR").includes(q)),
    );
  }, [products, term, category]);

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5 lg:flex-row lg:items-center">
        <label className="relative block flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por produto, marca ou SKU" aria-label="Buscar no catálogo de revenda" className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
        </label>
        <label className="relative block lg:w-60">
          <SlidersHorizontal className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrar por categoria" className="h-11 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
            {categories.map((item) => <option key={item} value={item}>{item === "Todas" ? "Todas as categorias" : item}</option>)}
          </select>
        </label>
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <span className="text-sm text-muted-foreground"><strong className="text-foreground">{filtered.length}</strong> {filtered.length === 1 ? "produto" : "produtos"}</span>
          <Link to="/carrinho" className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground hover:opacity-90"><ShoppingCart className="size-4" />Carrinho{cart.count > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs">{cart.count}</span>}</Link>
        </div>
      </section>

      <ResellerVolumeDiscountPanel products={products} />

      {filtered.length > 0 ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((product) => <ResellerProductCard key={product.slug} product={product} rules={rules} />)}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <Package className="mx-auto size-9 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">{products.length ? "Nenhum produto encontrado" : "O catálogo está sendo preparado"}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{products.length ? "Tente outro termo de busca ou selecione uma categoria diferente." : "Ainda não há produtos publicados disponíveis para revenda. Volte em breve ou fale com a equipe comercial."}</p>
          {products.length > 0 && <button type="button" onClick={() => { setTerm(""); setCategory("Todas"); }} className="mt-4 text-sm font-semibold text-brand underline underline-offset-4">Limpar filtros</button>}
        </section>
      )}
    </div>
  );
}
