import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Package, Search, SlidersHorizontal } from "lucide-react";
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
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <article key={product.slug} className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition hover:border-brand/40 hover:shadow-md">
              <Link to="/produto/$slug" params={{ slug: product.slug }} className="block bg-secondary p-4">
                <ProductImage src={product.images[0]} alt={product.name} className="aspect-[4/3] w-full rounded-lg" />
              </Link>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">{product.category || "Equipamento profissional"}</p>
                <h3 className="mt-2 font-display text-lg font-semibold leading-snug">{product.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{[product.brand, product.sku ? "Modelo: " + product.sku : null].filter(Boolean).join(" · ") || "Produto MCI Xpress"}</p>
                <div className="mt-5 rounded-lg border border-brand/20 bg-brand/5 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Seu preço de revenda</p>
                  <p className="mt-1 text-xl font-bold">{product.resellerPrice != null ? formatPrice(product.resellerPrice, product.currency) : "Sob consulta"}</p>
                  {product.resellerPrice == null && <p className="mt-1 text-xs leading-5 text-muted-foreground">Consulte a equipe comercial MCI para confirmar a condição deste produto.</p>}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{product.stock == null ? "Disponibilidade a confirmar" : product.stock > 0 ? product.stock + " unidades disponíveis" : "Sem estoque disponível"}</p>
                <Link to="/produto/$slug" params={{ slug: product.slug }} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-graphite px-4 text-sm font-semibold text-graphite-foreground transition hover:bg-brand hover:text-brand-foreground">Ver produto <ArrowUpRight className="size-4" /></Link>
              </div>
            </article>
          ))}
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
