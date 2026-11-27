import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Clock3, Coins, Gift, ShoppingBag, ArrowRight, Sparkles, Wallet } from "lucide-react";
import { SiteShell } from "@/components/shop/SiteShell";
import { ErrorState } from "@/components/shop/states";
import { useLoyalty } from "@/hooks/useLoyalty";
import { discountForPoints, pointsForAmount, LEDGER_LABEL, LOYALTY_NAME } from "@/lib/loyalty";

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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="relative isolate overflow-hidden rounded-3xl bg-[#15181d] px-6 py-10 text-white sm:px-12 sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 size-96 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-orange-400"><Sparkles className="size-4" /> Clube de fidelidade</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Store House <span className="text-orange-400">Pontos</span></h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/75">Suas compras podem render novas vantagens. Acumule pontos e transforme seu saldo em descontos nas próximas compras, conforme as regras do clube.</p>
            <Link to="/" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-orange-500 px-5 font-semibold text-black hover:bg-orange-400">Explorar produtos <ArrowRight className="size-4" /></Link>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-sm">
            <Coins className="size-10 text-orange-400" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-white/60">Benefício do clube</p>
            {s ? <><p className="mt-2 text-4xl font-bold tabular-nums">{(s.points_per_real * s.real_per_100_points).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</p><p className="mt-2 text-sm text-white/75">Retorno nominal em descontos, quando ativo. Pontos inteiros por compra.</p></> : <p className="mt-2 text-xl font-semibold">Compras que geram vantagens</p>}
            {s?.enabled === false && <p className="mt-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium">Programa temporariamente pausado</p>}
          </div>
        </div>
      </section>
      <section className="mt-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">Conheça seus benefícios</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">Mais valor em cada compra</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            { Icon: ShoppingBag, title: "Compre e acumule", description: s ? `A cada R$ 100 em produtos, a regra prevê ${pts(s.points_per_real * 100)}. Frete não acumula pontos.` : "Compras elegíveis geram pontos conforme as regras do clube." },
            { Icon: Wallet, title: "Transforme em desconto", description: s ? `Cada ponto equivale a ${money(rate / 100)}. Resgate a partir de ${pts(s.min_redeem_points)}, limitado a ${s.max_redeem_pct}% dos produtos por pedido.` : "Use seu saldo disponível em compras elegíveis." },
            { Icon: Gift, title: "Troque por brindes", description: "Em breve: catálogo de recompensas. O resgate de brindes ainda não está disponível." },
          ].map(({ Icon, title, description }) => <article key={title} className="rounded-2xl border bg-card p-6 shadow-sm"><span className="grid size-12 place-items-center rounded-xl bg-orange-500/10 text-brand"><Icon className="size-6" /></span><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></article>)}
        </div>
      </section>
      {s && <section className="mt-6 grid gap-5 rounded-2xl border bg-card p-6 sm:grid-cols-2 sm:p-8">
        <div><p className="text-xs font-bold uppercase tracking-widest text-brand">Exemplo de acúmulo</p><h2 className="mt-2 text-xl font-bold">Uma compra de {money(1000)}</h2><p className="mt-2 text-sm text-muted-foreground">Simulação com as regras atuais, para uma compra elegível quando o programa estiver ativo.</p></div>
        <div className="flex flex-wrap items-center gap-6 rounded-xl bg-secondary/50 p-5"><div><p className="text-xs text-muted-foreground">Pontos ganhos</p><p className="mt-1 text-2xl font-bold">{pts(pointsForAmount(1000, s.points_per_real))}</p></div><div><p className="text-xs text-muted-foreground">Equivalente em desconto</p><p className="mt-1 text-2xl font-bold text-brand">{money(discountForPoints(pointsForAmount(1000, s.points_per_real), rate))}</p></div></div>
      </section>}
      {s && <section className="mt-6 rounded-2xl border bg-card p-6"><h2 className="text-xl font-bold">Como funciona</h2><div className="mt-4 grid gap-4 sm:grid-cols-3"><div><p className="font-semibold">1. Compra elegível</p><p className="mt-1 text-sm text-muted-foreground">Pontos inteiros sobre o valor pago em produtos, sem frete.</p></div><div><p className="font-semibold">2. Liberação</p><p className="mt-1 text-sm text-muted-foreground">Após {s.grace_days} dias da confirmação do pagamento.</p></div><div><p className="font-semibold">3. Validade</p><p className="mt-1 text-sm text-muted-foreground">Cada lote vale {s.expiry_months} meses após a liberação.</p></div></div></section>}
      <section className="mt-8">
        <h2 className="text-2xl font-bold tracking-tight">Minha carteira de pontos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe seu saldo e suas movimentações.</p>
      </section>

      {query.isPending ? <div className="mt-8 rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando seus pontos…</div>
        : query.isError ? <div className="mt-8"><ErrorState message={query.error.message} onRetry={() => void query.refetch()} /></div>
        : !d?.signedIn ? <div className="mt-8 rounded-xl border bg-card p-8 text-center"><Coins className="mx-auto size-8 text-brand" /><h2 className="mt-3 font-semibold">Entre para ver seus pontos</h2><p className="mt-1 text-sm text-muted-foreground">Seus pontos ficam na sua conta.</p><Link to="/entrar" className="mt-4 inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground">Entrar</Link></div>
        : !d.eligible ? <div className="mt-8 rounded-xl border bg-card p-8 text-sm text-muted-foreground">{s?.enabled === false ? "O Store House Pontos está pausado no momento. Seu saldo continua guardado." : "Atualmente, o clube atende clientes finais. A participação de revendedores está em preparação."}</div>
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
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Gift className="size-5 text-brand" />Como usar seu saldo</h2><Link to="/" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground"><ShoppingBag className="size-4" />Ir às compras</Link></div>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              <li className="rounded-lg bg-secondary/50 p-4 text-sm"><p className="font-semibold">1. Compre</p><p className="mt-1 text-muted-foreground">A cada R$ 100 em produtos, você ganha {pts((s?.points_per_real ?? 0) * 100)}. Ex.: compra de R$ 1.000 = {pts(1000 * (s?.points_per_real ?? 1))}.</p></li>
              <li className="rounded-lg bg-secondary/50 p-4 text-sm"><p className="font-semibold">2. Aguarde {s?.grace_days} dias</p><p className="mt-1 text-muted-foreground">Depois da confirmação do pagamento, os pontos ficam disponíveis e valem por {s?.expiry_months} meses.</p></li>
              <li className="rounded-lg bg-secondary/50 p-4 text-sm"><p className="font-semibold">3. Use como desconto</p><p className="mt-1 text-muted-foreground">No checkout, marque "Usar meus pontos": Cada ponto vale {money(rate / 100)}. A partir de {pts(s?.min_redeem_points ?? 100)}, até {s?.max_redeem_pct}% dos produtos por pedido.</p></li>
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
