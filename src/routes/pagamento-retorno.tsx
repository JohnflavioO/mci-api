import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteShell } from "@/components/shop/SiteShell";

export const Route = createFileRoute("/pagamento-retorno")({
  head: () => ({ meta: [{ title: "Confirmação do pagamento | Store House" }] }),
  component: PaymentReturn,
});

function PaymentReturn() {
  const [state, setState] = useState<"checking" | "paid" | "pending" | "error">("checking");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderNsu = params.get("order_nsu") ?? "";
    const transactionNsu = params.get("transaction_nsu") ?? "";
    const slug = params.get("slug") ?? "";
    const receiptUrl = params.get("receipt_url");
    if (!orderNsu || !transactionNsu || !slug) { setState("pending"); return; }
    let active = true;
    fetch("/api/public/infinitepay-confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_nsu: orderNsu, transaction_nsu: transactionNsu, slug, receipt_url: receiptUrl }),
    }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { outcome?: string };
      if (!active) return;
      if (response.ok && (body.outcome === "paid" || body.outcome === "already_paid")) setState("paid");
      else if (response.ok) setState("pending");
      else setState("error");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);
  return <SiteShell><main className="mx-auto max-w-2xl px-4 py-20 text-center">
    {state === "checking" && <><h1 className="text-2xl font-bold">Confirmando seu pagamento</h1><p className="mt-3 text-muted-foreground">Estamos verificando a transação com a InfinitePay. Não feche esta página.</p></>}
    {state === "paid" && <><h1 className="text-2xl font-bold">Pagamento confirmado!</h1><p className="mt-3 text-muted-foreground">Seu pedido foi aprovado e já está registrado na Store House.</p><a className="mt-6 inline-flex rounded-md bg-foreground px-5 py-3 text-background" href="/meus-pedidos">Acompanhar pedido</a></>}
    {state === "pending" && <><h1 className="text-2xl font-bold">Pagamento em processamento</h1><p className="mt-3 text-muted-foreground">Ainda não recebemos uma confirmação definitiva. O pedido será atualizado automaticamente assim que a InfinitePay confirmar.</p><a className="mt-6 inline-flex rounded-md border px-5 py-3" href="/meus-pedidos">Ver meus pedidos</a></>}
    {state === "error" && <><h1 className="text-2xl font-bold">Não foi possível confirmar agora</h1><p className="mt-3 text-muted-foreground">Não tente pagar novamente antes de verificar o status do pedido. Consulte seus pedidos ou fale com o atendimento.</p><a className="mt-6 inline-flex rounded-md border px-5 py-3" href="/meus-pedidos">Ver meus pedidos</a></>}
  </main></SiteShell>;
}
