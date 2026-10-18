import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteShell } from "@/components/shop/SiteShell";
import { ProductImage } from "@/components/shop/ProductCard";
import { DemoBadge, EmptyState, LoadingState } from "@/components/shop/states";
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
        ) : !p ? (
          <EmptyState title="Produto não encontrado"><Link to="/catalogo" className="underline">Voltar ao catálogo</Link></EmptyState>
        ) : (
          <div className="grid gap-10 md:grid-cols-2">
            <ProductImage className="aspect-square rounded-md" />
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                {p.category} {q.data?.isDemo && <DemoBadge />}
              </div>
              <h1 className="mt-2 text-4xl font-bold">{p.name}</h1>
              <p className="mt-4 text-muted-foreground">{p.description}</p>
              <p className="mt-6 font-display text-2xl font-semibold">Preço sob consulta</p>
              <p className="text-sm text-muted-foreground">O preço para seu perfil será informado pela plataforma após login.</p>
              <p className="mt-4 text-sm">{p.inStock ? "Disponível" : "Indisponível no momento"}</p>
              <Button className="mt-6" size="lg" disabled={!p.inStock} onClick={() => { cart.add({ slug: p.slug, name: p.name }); toast.success("Adicionado ao carrinho"); }}>
                Adicionar ao carrinho
              </Button>
              <h2 className="mt-10 text-lg font-semibold">Especificações</h2>
              <dl className="mt-3 divide-y border-y text-sm">
                {Object.entries(p.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
