import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteShell } from "@/components/shop/SiteShell";
import { availabilityLabel, priceLabel, ProductImage } from "@/components/shop/ProductCard";
import { DemoBadge, EmptyState, ErrorState, LoadingState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { catalogService } from "@/services";

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
  const p = q.data?.product;

  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-4 py-10">
        {q.isPending ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : !p ? (
          <EmptyState title="Produto não encontrado"><Link to="/catalogo" className="underline">Voltar ao catálogo</Link></EmptyState>
        ) : (
          <div className="grid gap-10 md:grid-cols-2">
            <div className="space-y-3">
              <ProductImage src={p.images[0]} alt={p.name} className="aspect-square w-full rounded-md" />
              {p.images.length > 1 && (
                <div className="grid grid-cols-5 gap-2">
                  {p.images.slice(1, 6).map((src) => <ProductImage key={src} src={src} alt="" className="aspect-square w-full rounded" />)}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                {p.category} {q.data?.isDemo && <DemoBadge />}
              </div>
              <h1 className="mt-2 text-4xl font-bold">{p.name}</h1>
              {(p.brand || p.sku) && <p className="mt-1 text-sm text-muted-foreground">{[p.brand, p.sku && `SKU ${p.sku}`].filter(Boolean).join(" · ")}</p>}
              <p className="mt-4 text-muted-foreground">{p.description}</p>
              <p className="mt-6 font-display text-2xl font-semibold">{priceLabel(p)}</p>
              {p.customerPrice == null && <p className="text-sm text-muted-foreground">O preço para seu perfil será informado pela plataforma após login.</p>}
              <p className="mt-4 text-sm">{availabilityLabel(p)}</p>
              <Button className="mt-6" size="lg" disabled={p.inStock === false} onClick={() => { cart.add({ slug: p.slug, name: p.name }); toast.success("Adicionado ao carrinho"); }}>
                Adicionar ao carrinho
              </Button>
              <h2 className="mt-10 text-lg font-semibold">Especificações</h2>
              <dl className="mt-3 divide-y border-y text-sm">
                {p.specs.map(({ label: k, value: v }, i) => (
                  <div key={`${k}-${i}`} className="flex justify-between py-2"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
