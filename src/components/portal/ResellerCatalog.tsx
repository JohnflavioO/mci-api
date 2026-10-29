import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, Package, Search, SlidersHorizontal } from "lucide-react";
import { ProductImage } from "@/components/shop/ProductCard";
import { ErrorState, LoadingState } from "@/components/shop/states";
import { formatPrice } from "@/services/catalog";
import { createSupabaseCatalog } from "@/services/supabaseCatalog";

export function ResellerCatalog() {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("Todas");
  const query = useQuery({
    queryKey: ["reseller", "catalog"],
    queryFn: () => createSupabaseCatalog().listReseller(),
    staleTime: 30_000,
    retry: 1,
  });
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
    <div className="space-y-6">
      <section className="rounded-2xl bg-graphite p-6 text-graphite-foreground sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Condições para parceiros</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Seu catálogo de revenda</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite-muted">Consulte os produtos publicados e os preços de revenda disponibilizados para sua conta.</p>
          </div>
          <div className="rounded-lg border border-graphite-foreground/15 bg-graphite-foreground/5 px-4 py-3">
            <p className="text-xs text-graphite-muted">Produtos encontrados</p>
            <p className="mt-1 text-2xl font-bold">{filtered.length}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por produto, marca ou modelo" aria-label="Buscar no catálogo de revenda" className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
          </label>
          <label className="relative block">
            <SlidersHorizontal className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrar por categoria" className="h-11 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
              {categories.map((item) => <option key={item} value={item}>{item === "Todas" ? "Todas as categorias" : item}</option>)}
            </select>
          </label>
        </div>
      </section>

      {filtered.length > 0 ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((product) => {
            const hasBothPrices = product.resellerPrice != null && product.customerPrice != null && product.customerPrice > 0;
            const discountPercent = hasBothPrices
              ? Math.round(((product.customerPrice! - product.resellerPrice!) / product.customerPrice!) * 100)
              : null;
            return (
            <article key={product.slug} className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card transition-colors duration-200 hover:border-brand/50">
              <Link to="/produto/$slug" params={{ slug: product.slug }} aria-label={`Ver ${product.name}`} className="relative flex h-60 items-center justify-center overflow-hidden border-b border-border/60 bg-white p-0 sm:h-64">
                <ProductImage src={product.images[0]} alt={product.name} className="h-full w-full !bg-white object-contain scale-[1.18] transition-transform duration-300 group-hover:scale-[1.22]" />
                <span className="absolute left-3 top-3 rounded border border-border/70 bg-white/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{product.category || "Equipamento"}</span>\n                {discountPercent != null && discountPercent > 0 && <span className="absolute right-3 top-3 inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border-2 border-white bg-orange-500 px-2 text-sm font-extrabold leading-none text-white shadow-md ring-1 ring-orange-600/20" aria-label={`Economize ${discountPercent}%`} title={`${discountPercent}% de diferença para o preço de cliente final`}>-{discountPercent}%</span>}
              </Link>
              <div className="flex flex-1 flex-col p-4">
                <div className="min-h-[76px]">
                  <h3 className="line-clamp-2 text-base font-bold leading-6 tracking-tight">{product.name}</h3>
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">{[product.brand, product.sku ? "SKU " + product.sku : null].filter(Boolean).join(" · ") || "Produto MCI Xpress"}</p>
                </div>
                <div className="mt-3 space-y-2 border-y py-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand">Seu preço de revenda</p>
                    <p className="mt-1 text-2xl font-extrabold leading-7 tracking-tight text-foreground">{product.resellerPrice != null ? formatPrice(product.resellerPrice, product.currency) : "Sob consulta"}</p>
                  </div>
                  {hasBothPrices && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed pt-2">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Preço para cliente final</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{formatPrice(product.customerPrice!, product.currency)}</p>
                      </div>
                      {discountPercent != null && discountPercent > 0 && (
                        <span className="inline-flex shrink-0 items-center rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-bold text-orange-700 shadow-sm">
                          {discountPercent}% de diferença
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
                  {product.stock != null && product.stock > 0 ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <span className="size-1.5 rounded-full bg-muted-foreground/60" />}
                  <span>{product.stock == null ? "Disponibilidade a confirmar" : product.stock > 0 ? `${product.stock} ${product.stock === 1 ? "unidade disponível" : "unidades disponíveis"}` : "Consulte disponibilidade"}</span>
                </div>
                {product.resellerPrice == null && <p className="mt-2 text-xs leading-4 text-muted-foreground">Consulte a equipe comercial para confirmar sua condição.</p>}
                <Link to="/produto/$slug" params={{ slug: product.slug }} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-foreground/15 bg-foreground px-4 text-sm font-medium text-background transition-colors hover:border-brand hover:bg-brand hover:text-brand-foreground">Ver produto <ArrowUpRight className="size-4" /></Link>
              </div>
            </article>
            );
          })}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <Package className="mx-auto size-9 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">{products.length ? "Nenhum produto encontrado" : "O catálogo está sendo preparado"}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{products.length ? "Tente outro termo de busca ou selecione uma categoria diferente." : "Ainda não há produtos publicados disponíveis para revenda. Volte em breve ou fale com a equipe comercial MCI."}</p>
          {products.length > 0 && <button type="button" onClick={() => { setTerm(""); setCategory("Todas"); }} className="mt-4 text-sm font-semibold text-brand underline underline-offset-4">Limpar filtros</button>}
        </section>
      )}
    </div>
  );
}
