import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/shop/SiteShell";
import { EmptyState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/carrinho")({
  head: () => ({
    meta: [
      { title: "Carrinho | MCI Comercial" },
      { name: "description", content: "Revise os itens do seu carrinho na MCI Comercial." },
      { property: "og:title", content: "Carrinho | MCI Comercial" },
      { property: "og:description", content: "Revise os itens do seu carrinho na MCI Comercial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { items, setQty, remove } = useCart();
  return (
    <SiteShell>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-bold">Carrinho</h1>
        <div className="mt-8">
          {items.length === 0 ? (
            <EmptyState title="Seu carrinho está vazio"><Link to="/catalogo" className="underline">Ver catálogo</Link></EmptyState>
          ) : (
            <>
              <ul className="divide-y border-y">
                {items.map((i) => (
                  <li key={i.slug} className="flex items-center gap-4 py-4">
                    <span className="flex-1 font-medium">{i.name}</span>
                    <input type="number" min={1} value={i.qty} onChange={(e) => setQty(i.slug, Number(e.target.value))} className="w-16 rounded-sm border bg-background px-2 py-1" aria-label="Quantidade" />
                    <button onClick={() => remove(i.slug)} className="text-sm text-muted-foreground underline">Remover</button>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-muted-foreground">Preços, descontos e frete serão calculados pela plataforma na finalização.</p>
              <Button asChild className="mt-4" size="lg"><Link to="/checkout">Continuar para o checkout</Link></Button>
            </>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
