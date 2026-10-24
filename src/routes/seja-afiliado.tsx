import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, BadgePercent, BarChart3, CheckCircle2, CircleDollarSign,
  Link2, ShieldCheck, Users, Wallet, Zap,
} from "lucide-react";
import { SiteShell } from "@/components/shop/SiteShell";

export const Route = createFileRoute("/seja-afiliado")({
  head: () => ({
    meta: [
      { title: "Seja um Afiliado | MCI Xpress" },
      { name: "description", content: "Conheça o programa de afiliados MCI Xpress, cadastre-se e acompanhe suas indicações." },
      { property: "og:title", content: "Programa de Afiliados | MCI Xpress" },
      { property: "og:description", content: "Indique soluções profissionais e acompanhe suas comissões no portal MCI Xpress." },
    ],
  }),
  component: AffiliateLanding,
});

const benefits = [
  { icon: Link2, title: "Seu link de indicação", text: "Tenha um link próprio para compartilhar com sua audiência e sua rede de contatos." },
  { icon: BarChart3, title: "Acompanhe resultados", text: "Consulte as vendas atribuídas às suas indicações e acompanhe o desempenho." },
  { icon: CircleDollarSign, title: "Comissões organizadas", text: "Visualize as comissões registradas e o histórico de pagamentos no portal." },
];

function AffiliateLanding() {
  return (
    <SiteShell>
      <section className="relative isolate overflow-hidden bg-[#171a1f] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_80%_20%,rgba(255,104,31,.22),transparent_45%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-24 -z-10 size-[28rem] rounded-full bg-[#ff681f]/10 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_.9fr] lg:py-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#ff681f]/40 bg-[#ff681f]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-[#ff925d]">
              <BadgePercent className="size-4" /> Programa de afiliados MCI
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-.04em] sm:text-5xl lg:text-6xl">
              Transforme suas indicações em <span className="text-[#ff762f]">oportunidades.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/65 sm:text-lg">
              Faça parte da rede de parceiros MCI Xpress. Compartilhe produtos e soluções profissionais, acompanhe as vendas atribuídas às suas indicações e consulte suas comissões em um só lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/cadastro" search={{ tipo: "afiliado" }} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#ff681f] px-5 text-sm font-bold text-white shadow-lg shadow-black/20 transition hover:bg-[#e95712]">
                Quero ser afiliado <ArrowRight className="size-4" />
              </Link>
              <Link to="/entrar" className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5">
                Já sou afiliado — entrar
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/55">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-[#ff925d]" /> Acesso seguro à conta</span>
              <span className="inline-flex items-center gap-2"><Users className="size-4 text-[#ff925d]" /> Portal dedicado</span>
            </div>
          </div>
          <div className="relative">
            <div className="rounded-3xl border border-white/10 bg-white/[.045] p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#ff925d]">Área do parceiro</p><h2 className="mt-2 text-xl font-semibold">Tudo organizado em um portal</h2></div>
                <span className="grid size-12 place-items-center rounded-xl bg-[#ff681f]/15 text-[#ff925d]"><Zap className="size-6" /></span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["Link exclusivo", "Compartilhe suas indicações"],
                  ["Vendas atribuídas", "Consulte os resultados registrados"],
                  ["Comissões", "Acompanhe valores e status"],
                  ["Pagamentos", "Consulte seu histórico"],
                ].map(([title, detail]) => (
                  <div key={title} className="flex items-start gap-3 rounded-xl border border-white/[.08] bg-black/10 p-4">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#ff925d]" />
                    <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-white/50">{detail}</p></div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs leading-5 text-white/40">Recursos e condições do programa ficam sujeitos às regras comerciais e à disponibilidade da plataforma.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-brand">Como funciona</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Uma experiência simples para seus parceiros.</h2>
          <p className="mt-4 leading-7 text-muted-foreground">Cadastre-se, acesse seu portal e tenha visibilidade das informações de indicação disponíveis na plataforma.</p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {benefits.map(({ icon: Icon, title, text }, i) => (
            <article key={title} className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-secondary text-brand"><Icon className="size-5" /></span><span className="text-sm font-semibold text-muted-foreground/50">0{i + 1}</span></div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-5 rounded-2xl bg-secondary p-6 sm:flex-row sm:items-center sm:p-8">
          <div><h2 className="text-xl font-semibold">Pronto para começar?</h2><p className="mt-1 text-sm text-muted-foreground">Crie sua conta de afiliado ou entre para acessar seu portal.</p></div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link to="/cadastro" search={{ tipo: "afiliado" }} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Fazer cadastro <ArrowRight className="size-4" /></Link>
            <Link to="/entrar" className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-5 text-sm font-semibold transition hover:bg-card">Entrar na conta</Link>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="size-4" /> As regras de comissão, atribuição e pagamento devem ser consultadas nos termos oficiais do programa.</div>
      </section>
    </SiteShell>
  );
}
