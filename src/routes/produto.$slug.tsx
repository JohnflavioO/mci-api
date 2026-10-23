import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteShell } from "@/components/shop/SiteShell";
import { availabilityLabel, priceLabel, ProductImage } from "@/components/shop/ProductCard";
import { DemoBadge, EmptyState, ErrorState, LoadingState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { catalogService } from "@/services";
import { catalogSource } from "@/lib/api";
import { formatPrice } from "@/services/catalog";

export const Route = createFileRoute("/produto/$slug")({
  head: () => ({
    meta: [
      { title: "Produto | MCI Comercial" },
      { name: "description", content: "Detalhes técnicos, disponibilidade e condições do produto MCI." },
      { property: "og:title", content: "Produto | MCI Comercial" },
      { property: "og:description", content: "Detalhes técnicos, disponibilidade e condições do produto MCI." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const q = useQuery({ queryKey: ["product", slug], queryFn: () => catalogService.get(slug) });
  const cart = useCart();
  const rp = useQuery({ queryKey: ["reseller-price", slug], enabled: catalogSource() === "supabase", retry: false,
    queryFn: async () => (await import("@/services/supabaseCatalog")).createSupabaseCatalog().resellerPrice(slug) });
  const p = q.data?.product;

  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
        <div className="mb-6 text-sm text-muted-foreground"><Link to="/catalogo" className="transition hover:text-brand">Catálogo</Link><span className="mx-2">/</span><span className="text-foreground">Detalhes do produto</span></div>
        {q.isPending ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : !p ? (
          <EmptyState title="Produto não encontrado"><Link to="/catalogo" className="underline">Voltar ao catálogo</Link></EmptyState>
        ) : (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:gap-12">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl border bg-card p-3 shadow-sm sm:p-5">
                <ProductImage src={p.images[0]} alt={p.name} className="aspect-square w-full rounded-xl" />
              </div>
              {p.images.length > 1 && (
                <div className="grid grid-cols-5 gap-2">
                  {p.images.slice(1, 6).map((src) => <ProductImage key={src} src={src} alt="" className="aspect-square w-full rounded" />)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {p.category} {q.data?.isDemo && <DemoBadge />}
              </div>
              <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{p.name}</h1>
              {(p.brand || p.sku) && <p className="mt-1 text-sm text-muted-foreground">{[p.brand, p.sku && `SKU ${p.sku}`].filter(Boolean).join(" · ")}</p>}
              <div className="mt-5 border-y border-border py-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preço</p><p className="mt-1 font-display text-4xl font-bold text-foreground">{priceLabel(p)}</p>{rp.data != null && <p className="mt-2 text-sm font-semibold text-brand">Seu preço de revenda: {formatPrice(rp.data, p.currency)}</p>}</div>
              {p.customerPrice == null && <p className="text-sm text-muted-foreground">O preço para seu perfil será informado pela plataforma após login.</p>}
              <p className="mt-4 text-sm font-medium">{availabilityLabel(p)}</p>
              {p.stock != null && <p className="mt-1 text-sm text-muted-foreground">{p.stock > 0 ? `${p.stock} ${p.stock === 1 ? "unidade disponível" : "unidades disponíveis"}` : "Sem estoque no momento"}</p>}
              <Button className="mt-5 h-12 w-full bg-graphite text-graphite-foreground hover:bg-brand hover:text-brand-foreground sm:w-auto sm:px-10" size="lg" disabled={p.inStock === false || p.stock === 0} onClick={() => { if (cart.add({ slug: p.slug, name: p.name, maxQty: p.stock })) toast.success("Adicionado ao carrinho"); else toast.error("Quantidade máxima em estoque já está no carrinho."); }}>
                Adicionar ao carrinho
              </Button>
              <div className="mt-6 rounded-xl bg-muted/50 p-4 sm:p-5"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Descrição do produto</h2><p className="mt-2 whitespace-pre-line text-sm leading-7 text-foreground/80">{p.description || "Consulte nossa equipe para mais informações sobre este produto."}</p></div>
              </div>
              <div className="mt-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
                <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Ficha técnica</p><h2 className="mt-1 text-xl font-bold">Especificações do produto</h2></div><span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{p.specs.length} itens</span></div>
                {p.specs.length > 0 ? (
                  <dl className="mt-5 grid gap-2 sm:grid-cols-2">
                    {p.specs.map(({ label: k, value: v }, i) => (
                      <div key={`${k}-${i}`} className="min-w-0 rounded-xl border bg-muted/20 p-3.5">
                        <dt className="text-xs font-medium leading-5 text-muted-foreground">{k}</dt><dd className="mt-1 break-words text-sm font-semibold leading-6 text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="mt-4 rounded-xl bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">As especificações técnicas deste produto serão adicionadas em breve. Consulte nossa equipe para confirmar os detalhes.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
