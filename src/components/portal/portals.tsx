import { useQuery } from "@tanstack/react-query";
import {
  BadgePercent, Building2, Cable, CheckCircle2, CircleDollarSign, Clock, FileEdit, Link2, Package, Receipt,
  Settings, ShieldCheck, ShoppingCart, Store, Tags, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { portalService } from "@/services";
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

function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
      <Clock className="size-3" /> Integração pendente
    </span>
  );
}

function MetricCard({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="grid size-9 place-items-center rounded-md bg-secondary"><Icon className="size-4" /></span>
      </div>
      <p className="mt-4 font-display text-3xl font-bold text-muted-foreground/50">—</p>
      <div className="mt-2"><PendingBadge /></div>
    </div>
  );
}

export function PortalOverview({ portal }: { portal: PortalKey }) {
  const p = portals[portal];
  return (
    <div className="space-y-8">
      {portal === "admin" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total de produtos" icon={Package} />
          <MetricCard label="Produtos publicados" icon={CheckCircle2} />
          <MetricCard label="Rascunhos" icon={FileEdit} />
          <MetricCard label="Revendedores ativos" icon={Store} />
        </div>
      )}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Módulos e pendências</h2>
          <p className="text-sm text-muted-foreground">Os dados aparecem aqui quando cada integração com a API estiver disponível.</p>
        </div>
        <ul className="divide-y">
          {p.sections.map((s) => (
            <li key={s.slug} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <span className="flex items-center gap-3"><s.icon className="size-4 text-muted-foreground" />{s.label}</span>
              {s.slug === "importar" ? <span className="text-xs font-medium text-success">Disponível</span> : <PendingBadge />}
            </li>
          ))}
        </ul>
      </div>
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
        <div className="space-y-3"><PendingBadge /><ErrorState message={q.error.message} onRetry={() => void q.refetch()} /></div>
      ) : null}
    </div>
  );
}
