import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { SiteShell } from "@/components/shop/SiteShell";
import { ProductImage } from "@/components/shop/ProductCard";
import { EmptyState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/carrinho")({
  head: () => ({
    meta: [
      { title: "Carrinho | MCI Xpress" },
      { name: "description", content: "Revise os itens do seu carrinho no MCI Xpress." },
      { property: "og:title", content: "Carrinho | MCI Xpress" },
      { property: "og:description", content: "Revise os itens do seu carrinho no MCI Xpress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { items, setQty, remove, count } = useCart();

  return (
    <SiteShell>
      <div className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:pb-12 sm:pt-10">
        <header className="mb-6 flex items-center gap-3 sm:mb-8">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand"><ShoppingBag className="size-6" aria-hidden /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-brand">MCI Xpress</p>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Seu carrinho</h1>
            <p className="mt-1 text-sm text-muted-foreground">{count} {count === 1 ? "unidade" : "unidades"} selecionadas</p>
          </div>
        </header>
        {items.length === 0 ? (
          <div className="rounded-3xl border bg-card p-6 text-center shadow-sm sm:p-10">
            <EmptyState title="Seu carrinho está vazio">
              <p className="mt-2 text-sm text-muted-foreground">Explore o catálogo e encontre o equipamento ideal para seu projeto.</p>
              <Button asChild className="mt-5 rounded-xl"><Link to="/catalogo">Explorar catálogo <ArrowRight className="ml-2 size-4" /></Link></Button>
            </EmptyState>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Itens do carrinho">
              <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
                <h2 className="font-bold">Itens do pedido</h2>
                <Link to="/catalogo" className="text-xs font-semibold text-brand hover:underline">Continuar comprando</Link>
              </div>
              <ul className="divide-y">
                {items.map(item => (
                  <li key={item.slug} className="flex gap-3 p-4 sm:gap-4 sm:p-5">
                    <div className="size-[76px] shrink-0 overflow-hidden rounded-xl border bg-white sm:size-24"><ProductImage src={item.image ?? undefined} alt={item.name} className="size-full object-contain" /></div>
                    <div className="min-w-0 flex-1">
                      <Link to="/produto/$slug" params={{ slug: item.slug }} className="line-clamp-2 text-sm font-bold leading-5 hover:text-brand sm:text-base">{item.name}</Link>
                      <p className="mt-1 text-xs text-muted-foreground">Preço e descontos confirmados na finalização</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="inline-flex h-10 items-center overflow-hidden rounded-xl border bg-background" aria-label={`Quantidade de ${item.name}`}>
                          <button type="button" onClick={() => setQty(item.slug, item.qty - 1)} disabled={item.qty <= 1} aria-label={`Diminuir ${item.name}`} className="grid h-full w-10 place-items-center hover:bg-muted disabled:opacity-35"><Minus className="size-4" /></button>
                          <span className="min-w-9 px-1 text-center text-sm font-bold tabular-nums">{item.qty}</span>
                          <button type="button" onClick={() => setQty(item.slug, item.qty + 1)} disabled={item.maxQty != null && item.qty >= item.maxQty} aria-label={`Aumentar ${item.name}`} className="grid h-full w-10 place-items-center hover:bg-muted disabled:opacity-35"><Plus className="size-4" /></button>
                        </div>
                        <button type="button" onClick={() => remove(item.slug)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /> Remover</button>
                      </div>
                      {item.maxQty != null && <p className="mt-2 text-[11px] text-muted-foreground">Estoque máximo: {item.maxQty} unidades</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <aside className="rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-6">
              <h2 className="text-lg font-extrabold">Resumo do pedido</h2>
              <p className="mt-3 rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">Preços de revenda, descontos por quantidade, estoque e frete são validados conforme seu perfil e as regras vigentes.</p>
              <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm"><span className="text-muted-foreground">Produtos</span><strong>{items.length}</strong></div>
              <div className="mt-1 flex items-center justify-between text-sm"><span className="text-muted-foreground">Unidades</span><strong>{count}</strong></div>
              <Button asChild className="mt-5 h-12 w-full rounded-xl bg-graphite font-bold text-graphite-foreground hover:bg-brand hover:text-brand-foreground"><Link to="/checkout">Continuar para checkout <ArrowRight className="ml-2 size-4" /></Link></Button>
              <Link to="/catalogo" className="mt-3 block text-center text-xs font-semibold text-muted-foreground hover:text-brand">Continuar comprando</Link>
            </aside>
          </div>
        )}
      </div>
      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-18px_rgba(0,0,0,.35)] backdrop-blur-md sm:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-[11px] text-muted-foreground">{count} {count === 1 ? "unidade" : "unidades"}</p><p className="text-sm font-bold">Revise antes de finalizar</p></div>
            <Button asChild className="h-11 shrink-0 rounded-xl bg-graphite px-4 text-graphite-foreground hover:bg-brand hover:text-brand-foreground"><Link to="/checkout">Finalizar <ArrowRight className="ml-2 size-4" /></Link></Button>
          </div>
        </div>
      )}
    </SiteShell>
  );
}
