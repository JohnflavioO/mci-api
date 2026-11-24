import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Clock3, Coins, Gift, ShoppingBag } from "lucide-react";
import { SiteShell } from "@/components/shop/SiteShell";
import { ErrorState } from "@/components/shop/states";
import { useLoyalty } from "@/hooks/useLoyalty";
import { discountForPoints, LEDGER_LABEL, LOYALTY_NAME } from "@/lib/loyalty";

export const Route = createFileRoute("/meus-pontos")({
  head: () => ({
    meta: [
      { title: `Meus pontos | ${LOYALTY_NAME}` },
      { name: "description", content: "Acompanhe seu saldo do Store House Pontos e use como desconto nas próximas compras." },
    ],
  }),
  component: MyPoints,
});

const pts = (n: number) => `${Math.floor(n).toLocaleString("pt-BR")} pts`;
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => (value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value)) : "—");

function MyPoints() {
  const query = useLoyalty();
  const d = query.data;
  const s = d?.settings;
  const rate = s?.real_per_100_points ?? 1;

  return <SiteShell>
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{LOYALTY_NAME}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Meus pontos</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {s ? `A cada R$ 1,00 em produtos você ganha ${s.points_per_real.toLocaleString("pt-BR")} ponto(s). ${Number(100).toLocaleString("pt-BR")} pontos valem ${money(rate)} de desconto no checkout.` : "Ganhe pontos nas suas compras e use como desconto nas próximas."}
      </p>

      {query.isPending ? <div className="mt-8 rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando seus pontos…</div>
        : query.isError ? <div className="mt-8"><ErrorState message={query.error.message} onRetry={() => void query.refetch()} /></div>
        : !d?.signedIn ? <div className="mt-8 rounded-xl border bg-card p-8 text-center"><Coins className="mx-auto size-8 text-brand" /><h2 className="mt-3 font-semibold">Entre para ver seus pontos</h2><p className="mt-1 text-sm text-muted-foreground">Seus pontos ficam na sua conta.</p><Link to="/entrar" className="mt-4 inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground">Entrar</Link></div>
        : !d.eligible ? <div className="mt-8 rounded-xl border bg-card p-8 text-sm text-muted-foreground">{s?.enabled === false ? "O Store House Pontos está pausado no momento. Seu saldo continua guardado." : "O Store House Pontos é exclusivo para clientes finais. Contas de revendedor têm condições próprias no portal."}</div>
        : <>
          <section className="mt-8 grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-orange-200 bg-orange-50/60 p-5">
              <div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Disponível</p><Coins className="size-4 text-brand" /></div>
              <p className="mt-3 text-3xl font-semibold tabular-nums">{pts(d.balance?.available ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Vale {money(discountForPoints(d.balance?.available ?? 0, rate))} de desconto. Use até {s?.max_redeem_pct}% do valor dos produtos por pedido.</p>
            </article>
            <article className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Em liberação</p><Clock3 className="size-4 text-muted-foreground" /></div>
              <p className="mt-3 text-3xl font-semibold tabular-nums">{pts(d.balance?.pending ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Liberados {s?.grace_days} dias após a confirmação do pagamento.</p>
            </article>
            <article className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Vencem em 30 dias</p><CalendarClock className="size-4 text-muted-foreground" /></div>
              <p className="mt-3 text-3xl font-semibold tabular-nums">{pts(d.balance?.expiring30d ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{d.balance?.nextExpiry ? `Próximo vencimento: ${date(d.balance.nextExpiry)}.` : `Cada lote vale ${s?.expiry_months} meses depois de liberado.`}</p>
            </article>
          </section>

          <section className="mt-6 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Gift className="size-5 text-brand" />Como funciona</h2><Link to="/" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground"><ShoppingBag className="size-4" />Ir às compras</Link></div>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              <li className="rounded-lg bg-secondary/50 p-4 text-sm"><p className="font-semibold">1. Compre</p><p className="mt-1 text-muted-foreground">Cada R$ 1,00 em produtos vira {s?.points_per_real.toLocaleString("pt-BR")} ponto(s). Ex.: compra de R$ 1.000 = {pts(1000 * (s?.points_per_real ?? 1))}.</p></li>
              <li className="rounded-lg bg-secondary/50 p-4 text-sm"><p className="font-semibold">2. Aguarde {s?.grace_days} dias</p><p className="mt-1 text-muted-foreground">Depois da confirmação do pagamento, os pontos ficam disponíveis e valem por {s?.expiry_months} meses.</p></li>
              <li className="rounded-lg bg-secondary/50 p-4 text-sm"><p className="font-semibold">3. Use como desconto</p><p className="mt-1 text-muted-foreground">No checkout, marque "Usar meus pontos": 100 pts = {money(rate)}. A partir de {pts(s?.min_redeem_points ?? 100)}, até {s?.max_redeem_pct}% dos produtos por pedido.</p></li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Se o pedido em que você usou pontos for cancelado, eles voltam para o seu saldo. Frete não conta para acumular.</p>
          </section>

          <section className="mt-6 rounded-xl border bg-card">
            <div className="border-b p-5"><h2 className="font-semibold">Extrato</h2><p className="mt-1 text-sm text-muted-foreground">Últimos 50 lançamentos.</p></div>
            {d.ledger?.length ? <ul className="divide-y">{d.ledger.map((e) => <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <span><span className="font-medium">{LEDGER_LABEL[e.kind] ?? e.kind}</span> · {e.description}<span className="block text-xs text-muted-foreground">{date(e.created_at)}{e.kind === "earn" && e.available_at && new Date(e.available_at) > new Date() ? ` · libera em ${date(e.available_at)}` : ""}{e.kind === "earn" && e.expires_at ? ` · vence em ${date(e.expires_at)}` : ""}</span></span>
              <span className={`font-semibold tabular-nums ${e.points < 0 ? "text-rose-700" : "text-emerald-700"}`}>{e.points > 0 ? "+" : ""}{pts(e.points)}</span>
            </li>)}</ul> : <div className="p-8 text-center text-sm text-muted-foreground">Seus pontos aparecem aqui quando a primeira compra for paga.</div>}
          </section>
        </>}
    </div>
  </SiteShell>;
}
