import { Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, Clock3, FileText, PackageCheck, ShoppingBag } from "lucide-react";

const plannedStages = [
  { title: "Solicitado", description: "Pedido enviado para análise comercial.", icon: FileText },
  { title: "Em análise", description: "A equipe MCI verifica disponibilidade e condições.", icon: Clock3 },
  { title: "Confirmado", description: "Itens, valores e condições comerciais confirmados.", icon: PackageCheck },
  { title: "Concluído", description: "Acompanhe a finalização e o histórico do pedido.", icon: ShoppingBag },
];

export function ResellerOrders() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-graphite p-6 text-graphite-foreground sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Área comercial</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Seus pedidos, em um só lugar</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite-muted">Acompanhe solicitações, confirmações comerciais e o andamento de cada pedido quando o fluxo estiver ativado.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-graphite-foreground/15 bg-graphite-foreground/5 px-3 py-2 text-xs font-semibold"><Clock3 className="size-3.5 text-brand" /> Preparação da integração</span>
        </div>
      </section>

      <section aria-label="Resumo de pedidos" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Todos os pedidos", note: "Aguardando conexão dos dados", icon: ClipboardList },
          { label: "Aguardando análise", note: "Etapa comercial planejada", icon: Clock3 },
          { label: "Confirmados", note: "Etapa comercial planejada", icon: PackageCheck },
          { label: "Concluídos", note: "Histórico planejado", icon: ShoppingBag },
        ].map(({ label, note, icon: Icon }) => (
          <article key={label} className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-3 font-display text-3xl font-semibold tracking-tight text-muted-foreground">—</p></div>
              <span className="grid size-10 place-items-center rounded-lg bg-secondary"><Icon className="size-5 text-muted-foreground" /></span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{note}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div><h3 className="font-semibold">Histórico de pedidos</h3><p className="mt-1 text-sm text-muted-foreground">Os pedidos reais aparecerão aqui após a ativação do fluxo.</p></div>
          <span className="rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">Integração pendente</span>
        </div>
        <div className="px-5 py-12 text-center sm:px-8 sm:py-16">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary"><ClipboardList className="size-7 text-muted-foreground" /></span>
          <h3 className="mt-4 text-lg font-semibold">Seu histórico será exibido aqui</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Ainda não há conexão entre esta tela e o sistema de pedidos. Nenhum pedido ou valor está sendo simulado. Quando a integração for concluída, você poderá consultar número, data, itens, total, status e detalhes de cada solicitação.</p>
          <Link to="/revendedor/$secao" params={{ secao: "catalogo" }} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-graphite px-4 text-sm font-semibold text-graphite-foreground transition hover:bg-brand hover:text-brand-foreground">Explorar catálogo <ArrowRight className="size-4" /></Link>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h3 className="font-semibold">Como funcionará o acompanhamento</h3>
        <p className="mt-1 text-sm text-muted-foreground">Etapas previstas para o fluxo comercial; ainda não representam status de pedidos reais.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plannedStages.map(({ title, description, icon: Icon }, index) => (
            <div key={title} className="relative rounded-lg border border-dashed p-4">
              <span className="grid size-9 place-items-center rounded-lg bg-secondary"><Icon className="size-4 text-brand" /></span>
              <p className="mt-3 text-sm font-semibold">{String(index + 1).padStart(2, "0")} · {title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
