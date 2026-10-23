import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteShell } from "@/components/shop/SiteShell";
import { EmptyState, ErrorState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { ORDER_STATUS_LABEL, orderService } from "@/services";

export const Route = createFileRoute("/meus-pedidos")({
  head: () => ({
    meta: [
      { title: "Meus pedidos | MCI Comercial" },
      { name: "description", content: "Acompanhe o pagamento e a situação dos seus pedidos MCI." },
      { property: "og:title", content: "Meus pedidos | MCI Comercial" },
      { property: "og:description", content: "Acompanhe o pagamento e a situação dos seus pedidos MCI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyOrders,
});

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function MyOrders() {
  const q = useQuery({ queryKey: ["my-orders"], queryFn: orderService.list, retry: false });
  const signedOut = q.error instanceof ApiError && q.error.status === 401;
  return (
    <SiteShell>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-bold">Meus pedidos</h1>
        <div className="mt-8">
          {q.isPending ? <p className="text-muted-foreground">Carregando…</p>
            : signedOut ? <div><p className="text-muted-foreground">Entre na sua conta para ver seus pedidos.</p><Button asChild className="mt-4"><Link to="/entrar">Entrar</Link></Button></div>
            : q.isError ? <ErrorState message={q.error.message} />
            : q.data.length === 0 ? <EmptyState title="Você ainda não fez pedidos"><Link to="/catalogo" className="underline">Ver catálogo</Link></EmptyState>
            : (
              <ul className="space-y-4">
                {q.data.map((o) => (
                  <li key={o.id} className="rounded-xl border bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
                      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{ORDER_STATUS_LABEL[o.status]}</span>
                    </div>
                    <ul className="mt-3 text-sm">
                      {o.order_items.map((i, k) => <li key={k}>{i.qty}× {i.name_snapshot} — {brl(i.unit_price)}</li>)}
                    </ul>
                    <p className="mt-3 font-semibold">Total: {brl(o.total)}</p>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </SiteShell>
  );
}
