import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, ArrowUpRight, BadgePercent, Building2, Cable, CheckCircle2, CircleDollarSign, ImagePlus,
  Clock, FileEdit, Link2, Package, Plus, Receipt, Settings, ShieldCheck, ShoppingCart,
  Store, Tags, Upload, Users, Wallet, UserRoundCog, type LucideIcon,
} from "lucide-react";
import { portalService } from "@/services";
import { resellerService, statusLabel } from "@/services/resellers";
import { createSupabaseCatalog } from "@/services/supabaseCatalog";
import { ErrorState, LoadingState } from "@/components/shop/states";
import type { PortalSection } from "./PortalLayout";

export const portals = {
  revendedor: {
    title: "Portal do Revendedor",
    sections: [
      { slug: "catalogo", label: "Catálogo de revenda", icon: Store, description: "Produtos disponíveis com a sua tabela de revenda." },
      { slug: "pedidos", label: "Pedidos", icon: ShoppingCart, description: "Acompanhe seus pedidos." },
      { slug: "aprovacao", label: "Status de aprovação", icon: CheckCircle2, description: "Situação da análise do seu cadastro." },
      { slug: "conta", label: "Configurações da conta", icon: UserRoundCog, description: "Foto de perfil, contato e dados cadastrais da empresa." },
    ],
  },
  afiliado: {
    title: "Portal do Afiliado",
    sections: [
      { slug: "link", label: "Link de indicação", icon: Link2, description: "Seu link exclusivo de indicação." },
      { slug: "vendas", label: "Vendas atribuídas", icon: Receipt, description: "Vendas realizadas pelo seu link." },
      { slug: "comissoes", label: "Comissões", icon: BadgePercent, description: "Comissões geradas pelas vendas." },
      { slug: "pagamentos", label: "Pagamentos", icon: Wallet, description: "Histórico de pagamentos recebidos." },
    ],
  },
  admin: {
    title: "Central Administrativa",
    sections: [
      { slug: "produtos", label: "Produtos", icon: Package, group: "Principal", description: "Catálogo de produtos cadastrados." },
      { slug: "importar", label: "Importar produto por link", icon: Cable, group: "Principal", description: "Traga produtos da MCI Store a partir do link." },
      { slug: "banners", label: "Banners da página inicial", icon: ImagePlus, group: "Principal", description: "Gerencie o slider e as campanhas da hero da loja." },
      { slug: "pedidos", label: "Pedidos", icon: ShoppingCart, group: "Operação comercial", description: "Pedidos de clientes e revendedores." },
      { slug: "precos", label: "Preços", icon: Tags, group: "Operação comercial", description: "Tabelas de preço para clientes e revendedores." },
      { slug: "revendedores", label: "Revendedores", icon: Store, group: "Operação comercial", description: "Cadastro e aprovação de revendedores." },
      { slug: "afiliados", label: "Afiliados", icon: Link2, group: "Operação comercial", description: "Parceiros com link de indicação." },
      { slug: "comissoes", label: "Comissões", icon: CircleDollarSign, group: "Operação comercial", description: "Regras e apuração de comissões." },
      { slug: "usuarios", label: "Usuários", icon: Users, group: "Administração", description: "Contas com acesso à plataforma." },
      { slug: "permissoes", label: "Permissões", icon: ShieldCheck, group: "Administração", description: "Perfis e níveis de acesso." },
      { slug: "configuracoes", label: "Configurações", icon: Settings, group: "Administração", description: "Preferências gerais da plataforma." },
    ],
  },
} satisfies Record<string, { title: string; sections: PortalSection[] }>;

export type PortalKey = keyof typeof portals;

function MetricCard({
  label, value, detail, icon: Icon, to, loading,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  to: "/admin/produtos" | "/admin/revendedores";
  loading: boolean;
}) {
  return (
    <Link to={to} className="group rounded-xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sidebar-primary/50 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground">
            {loading ? <span className="inline-block h-8 w-12 animate-pulse rounded bg-muted" /> : value}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground transition-colors group-hover:bg-sidebar-primary/15">
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
        Ver detalhes <ArrowUpRight className="size-3.5" />
      </div>
    </Link>
  );
}

function QuickAction({ to, title, description, icon: Icon }: {
  to: "/admin/produtos" | "/admin/importar" | "/admin/revendedores";
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link to={to} className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-all hover:border-sidebar-primary/50 hover:shadow-sm">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-foreground group-hover:bg-sidebar-primary/15">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function PortalOverview({ portal }: { portal: PortalKey }) {
  const p = portals[portal];
  const productsQuery = useQuery({
    queryKey: ["admin-dashboard", "products"],
    queryFn: () => createSupabaseCatalog().listAdmin(),
    enabled: portal === "admin",
    staleTime: 30_000,
    retry: 1,
  });
  const products = productsQuery.data ?? [];
  const published = products.filter((product) => product.status === "published").length;
  const drafts = products.filter((product) => product.status === "draft").length;
  const categories = new Set(products.map((product) => product.category?.trim()).filter(Boolean)).size;
  const resellerQuery = useQuery({ queryKey: ["reseller", "dashboard-overview"], queryFn: () => resellerService.myAccess(), enabled: portal === "revendedor", retry: false });

  if (portal === "admin") {
    return (
      <div className="space-y-8">
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sidebar-primary">Resumo da operação</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Sua operação em um só lugar</h2>
              <p className="mt-1 text-sm text-muted-foreground">Indicadores atualizados com os dados disponíveis no Supabase.</p>
            </div>
            <Link to="/admin/produtos" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90">
              <Plus className="size-4" /> Novo produto
            </Link>
          </div>

          {productsQuery.isError ? (
            <div className="mb-4 rounded-xl border border-destructive/25 bg-card p-4">
              <p className="text-sm font-medium">Não foi possível carregar os indicadores de produtos.</p>
              <p className="mt-1 text-xs text-muted-foreground">Verifique a sessão administrativa e as permissões do Supabase.</p>
              <button onClick={() => void productsQuery.refetch()} className="mt-3 text-sm font-semibold underline underline-offset-4">Tentar novamente</button>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total de produtos" value={products.length} detail="Itens no catálogo administrativo" icon={Package} to="/admin/produtos" loading={productsQuery.isPending} />
            <MetricCard label="Publicados" value={published} detail="Visíveis no catálogo público" icon={CheckCircle2} to="/admin/produtos" loading={productsQuery.isPending} />
            <MetricCard label="Rascunhos" value={drafts} detail="Ainda não exibidos ao público" icon={FileEdit} to="/admin/produtos" loading={productsQuery.isPending} />
            <MetricCard label="Categorias" value={categories} detail="Categorias utilizadas no catálogo" icon={Tags} to="/admin/produtos" loading={productsQuery.isPending} />
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Ações rápidas</h2>
            <p className="mt-1 text-sm text-muted-foreground">Acesse diretamente as tarefas mais comuns.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <QuickAction to="/admin/produtos" title="Gerenciar produtos" description="Cadastrar, editar, publicar e organizar o catálogo." icon={Package} />
            <QuickAction to="/admin/importar" title="Importar por link" description="Iniciar uma importação a partir de um produto da MCI Store." icon={Upload} />
            <QuickAction to="/admin/revendedores" title="Revendedores" description="Consultar cadastros e acompanhar aprovações." icon={Store} />
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary"><Clock className="size-4 text-muted-foreground" /></span>
            <div>
              <h2 className="text-sm font-semibold">Status da plataforma</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                A gestão de produtos está conectada ao Supabase. Os módulos de pedidos, preços, afiliados e comissões ainda precisam de suas integrações funcionais; eles não são contabilizados como métricas até que existam dados confiáveis.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (portal === "revendedor") {
    const app = resellerQuery.data?.application;
    const status = app ? statusLabel[app.status] : resellerQuery.data?.signedIn ? "Cadastro não localizado" : "Entre na sua conta";
    return (
      <div className="space-y-6">
        <section className="rounded-2xl bg-graphite p-6 text-graphite-foreground sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Área do parceiro MCI</p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Bem-vindo ao Portal do Revendedor</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite-muted">Gerencie seus dados comerciais, acompanhe a análise do cadastro e consulte as áreas disponíveis para sua conta.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/revendedor/$secao" params={{ secao: "conta" }} className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground hover:opacity-90"><UserRoundCog className="size-4" /> Configurar minha conta</Link>
            <Link to="/revendedor/$secao" params={{ secao: "aprovacao" }} className="inline-flex h-10 items-center gap-2 rounded-md border border-graphite-foreground/20 px-4 text-sm font-medium hover:bg-graphite-foreground/5"><CheckCircle2 className="size-4" /> Ver aprovação</Link>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Situação do cadastro</p><p className="mt-3 text-xl font-semibold">{resellerQuery.isPending ? "Carregando…" : status}</p><p className="mt-2 text-xs text-muted-foreground">A aprovação libera os preços exclusivos de revenda.</p></div>
          <Link to="/revendedor/$secao" params={{ secao: "empresa" }} className="rounded-xl border bg-card p-5 transition hover:border-brand/50 hover:shadow-sm"><Building2 className="size-5 text-brand" /><p className="mt-3 font-semibold">Dados da empresa</p><p className="mt-1 text-sm text-muted-foreground">Revise os dados cadastrais e contatos comerciais.</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">Ver dados <ArrowRight className="size-4" /></span></Link>
          <Link to="/revendedor/$secao" params={{ secao: "catalogo" }} className="rounded-xl border bg-card p-5 transition hover:border-brand/50 hover:shadow-sm"><Store className="size-5 text-brand" /><p className="mt-3 font-semibold">Catálogo de revenda</p><p className="mt-1 text-sm text-muted-foreground">Consulte produtos e preços disponíveis para sua conta aprovada.</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">Abrir catálogo <ArrowRight className="size-4" /></span></Link>
        </section>
        <section className="rounded-xl border bg-card p-5 sm:p-6">
          <h3 className="font-semibold">Acesso rápido</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {p.sections.map((s) => <Link key={s.slug} to="/revendedor/$secao" params={{ secao: s.slug }} className="flex items-center gap-3 rounded-lg border p-4 text-sm transition hover:bg-secondary"><s.icon className="size-4 text-brand" /><span className="min-w-0 flex-1"><span className="block font-semibold">{s.label}</span><span className="mt-1 block text-xs text-muted-foreground">{s.description}</span></span><ArrowRight className="size-4 text-muted-foreground" /></Link>)}
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-5 py-4"><h2 className="font-semibold">Visão geral</h2><p className="text-sm text-muted-foreground">Acesse uma área do seu portal.</p></div>
      <ul className="divide-y">{p.sections.map((s) => <li key={s.slug} className="flex items-center justify-between gap-4 px-5 py-3 text-sm"><span className="flex items-center gap-3"><s.icon className="size-4 text-muted-foreground" />{s.label}</span><span className="text-xs text-muted-foreground">{s.description}</span></li>)}</ul>
    </div>
  );
}

export function PortalSectionView({ portal, slug }: { portal: PortalKey; slug: string }) {
  const p = portals[portal];
  const section = p.sections.find((s) => s.slug === slug);
  const label = section?.label ?? slug;

  if (portal === "revendedor" && slug === "aprovacao") {
    return <ResellerApprovalStatus />;
  }

  const q = useQuery({ queryKey: ["portal", portal, slug], queryFn: () => portalService.section(p.title, label), retry: false });
  return (
    <div className="rounded-lg border bg-card p-6">
      {q.isPending ? <LoadingState /> : q.isError ? (
        <div className="space-y-3"><ErrorState message={q.error.message} onRetry={() => void q.refetch()} /></div>
      ) : null}
    </div>
  );
}

function ResellerApprovalStatus() {
  const statusQuery = useQuery({
    queryKey: ["reseller", "approval-status"],
    queryFn: () => resellerService.myAccess(),
    retry: false,
  });

  if (statusQuery.isPending) return <LoadingState />;
  if (statusQuery.isError) return <ErrorState message={statusQuery.error.message} onRetry={() => void statusQuery.refetch()} />;

  const { application, signedIn } = statusQuery.data;
  if (!signedIn) return <ErrorState message="Sua sessão expirou. Entre novamente para consultar o cadastro." onRetry={() => void statusQuery.refetch()} />;

  if (!application) {
    return (
      <section className="rounded-xl border bg-card p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Cadastro de revendedor não localizado</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Não encontramos uma solicitação comercial vinculada a esta conta. Entre em contato com o suporte para conferir o cadastro.</p>
      </section>
    );
  }

  const descriptions: Record<string, string> = {
    pendente: "Recebemos seu cadastro. A equipe comercial ainda precisa concluir a análise.",
    documentacao_solicitada: "A equipe solicitou informações ou documentos adicionais. Consulte a observação abaixo e fale com o atendimento para regularizar os dados.",
    aprovado: "Seu cadastro está aprovado. O acesso aos preços e às condições de revenda depende das permissões ativas da sua conta.",
    rejeitado: "Sua solicitação não foi aprovada. Consulte a justificativa abaixo e fale com o atendimento se precisar de orientação.",
  };
  const statuses: Record<string, { label: string; className: string }> = {
    pendente: { label: "Pendente", className: "border-amber-300 bg-amber-50 text-amber-900" },
    documentacao_solicitada: { label: "Documentação solicitada", className: "border-blue-300 bg-blue-50 text-blue-900" },
    aprovado: { label: "Aprovado", className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
    rejeitado: { label: "Rejeitado", className: "border-red-300 bg-red-50 text-red-900" },
  };
  const current = statuses[application.status] ?? statuses.pendente;
  const createdAt = new Date(application.created_at).toLocaleDateString("pt-BR");
  const reviewedAt = application.reviewed_at ? new Date(application.reviewed_at).toLocaleDateString("pt-BR") : null;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Análise do cadastro</h2>
            <p className="mt-1 text-sm text-muted-foreground">Acompanhe a situação atual da sua solicitação de revenda.</p>
          </div>
          <span className={"inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold " + current.className}>{current.label}</span>
        </div>
        <p className="mt-5 text-sm leading-6">{descriptions[application.status] ?? "Consulte o atendimento para obter informações sobre sua solicitação."}</p>
        <div className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Empresa</p><p className="mt-1 font-medium">{application.trade_name || application.company_name}</p></div>
          <div><p className="text-xs text-muted-foreground">CNPJ</p><p className="mt-1 font-medium">{application.cnpj}</p></div>
          <div><p className="text-xs text-muted-foreground">Data da solicitação</p><p className="mt-1 font-medium">{createdAt}</p></div>
          <div><p className="text-xs text-muted-foreground">Última análise</p><p className="mt-1 font-medium">{reviewedAt ?? "Ainda não analisado"}</p></div>
        </div>
        {application.review_note && <div className="mt-5 rounded-lg border bg-secondary/50 p-4"><p className="text-sm font-semibold">Observação da equipe</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{application.review_note}</p></div>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <p className="text-xs text-muted-foreground">As informações são carregadas do cadastro vinculado à sua conta.</p>
          <button type="button" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50">
            Atualizar status
          </button>
        </div>
      </section>
    </div>
  );
}
