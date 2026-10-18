import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { SiteShell } from "@/components/shop/SiteShell";
import { EmptyState, ErrorState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCart } from "@/lib/cart";
import { orderService } from "@/services";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout | MCI Comercial" },
      { name: "description", content: "Informe entrega e pagamento para finalizar seu pedido MCI." },
      { property: "og:title", content: "Checkout | MCI Comercial" },
      { property: "og:description", content: "Informe entrega e pagamento para finalizar seu pedido MCI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const { items } = useCart();
  const m = useMutation({ mutationFn: () => orderService.create(items.map((i) => ({ slug: i.slug, qty: i.qty }))) });
  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">Checkout</h1>
        {items.length === 0 ? (
          <div className="mt-8"><EmptyState title="Nenhum item para finalizar" /></div>
        ) : (
          <form className="mt-8 space-y-8" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-3 font-display text-lg font-semibold">Entrega</legend>
              {["Nome completo", "CPF/CNPJ", "CEP", "Endereço", "Cidade", "Estado"].map((f) => (
                <div key={f}><Label>{f}</Label><Input required className="mt-1" /></div>
              ))}
            </fieldset>
            <div>
              <p className="font-display text-lg font-semibold">Pagamento</p>
              <p className="mt-1 text-sm text-muted-foreground">As formas de pagamento serão disponibilizadas quando a integração estiver pronta.</p>
            </div>
            <p className="text-sm">{items.reduce((n, i) => n + i.qty, 0)} item(ns) · total calculado pela plataforma</p>
            {m.isError && <ErrorState message={m.error.message} />}
            <Button type="submit" size="lg" disabled={m.isPending}>{m.isPending ? "Enviando…" : "Finalizar pedido"}</Button>
          </form>
        )}
      </div>
    </SiteShell>
  );
}
