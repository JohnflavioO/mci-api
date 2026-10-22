import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, ArrowUpRight, BadgePercent, Building2, Cable, CheckCircle2, CircleDollarSign,
  Clock, FileEdit, Link2, Package, Plus, Receipt, Settings, ShieldCheck, ShoppingCart,
  Store, Tags, Upload, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { portalService } from "@/services";
import { createSupabaseCatalog } from "@/services/supabaseCatalog";
import { ErrorState, LoadingState } from "@/components/shop/states";
import type { PortalSection } from "./PortalLayout";

export const portals = {
  revendedor: {
    title: "Portal do Revendedor",
    sections: [
      { slug: "catalogo", label: "Catálogo de revenda", icon: Store, description: "Produtos disponíveis com a sua tabela de revenda." },
      { slug: "pedidos", label: "Pedidos", icon: ShoppingCart, description: "Acompanhe seus pedidos." },
      { slug: "empresa", label: "Dados da empresa", icon: Building2, description: "Informações cadastrais da empresa." },
      { slug: "aprovacao", label: "Status de aprovação", icon: CheckCircle2, description: "Situação da análise do seu cadastro." },
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

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">Visão geral</h2>
        <p className="text-sm text-muted-foreground">Acesse uma área do seu portal.</p>
      </div>
      <ul className="divide-y">
        {p.sections.map((s) => (
          <li key={s.slug} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            <span className="flex items-center gap-3"><s.icon className="size-4 text-muted-foreground" />{s.label}</span>
            <span className="text-xs text-muted-foreground">{s.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PortalSectionView({ portal, slug }: { portal: PortalKey; slug: string }) {
  const p = portals[portal];
  const section = p.sections.find((s) => s.slug === slug);
  const label = section?.label ?? slug;
  const q = useQuery({ queryKey: ["portal", portal, slug], queryFn: () => portalService.section(p.title, label), retry: false });
  return (
    <div className="rounded-lg border bg-card p-6">
      {q.isPending ? <LoadingState /> : q.isError ? (
        <div className="space-y-3"><ErrorState message={q.error.message} onRetry={() => void q.refetch()} /></div>
      ) : null}
    </div>
  );
}
