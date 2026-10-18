import { useQuery } from "@tanstack/react-query";
import { portalService } from "@/services";
import { ErrorState, LoadingState } from "@/components/shop/states";
import type { PortalSection } from "./PortalLayout";

export const portals = {
  revendedor: {
    title: "Portal do Revendedor",
    sections: [
      { slug: "catalogo", label: "Catálogo de revenda" },
      { slug: "pedidos", label: "Pedidos" },
      { slug: "empresa", label: "Dados da empresa" },
      { slug: "aprovacao", label: "Status de aprovação" },
    ],
  },
  afiliado: {
    title: "Portal do Afiliado",
    sections: [
      { slug: "link", label: "Link de indicação" },
      { slug: "vendas", label: "Vendas atribuídas" },
      { slug: "comissoes", label: "Comissões" },
      { slug: "pagamentos", label: "Pagamentos" },
    ],
  },
  admin: {
    title: "Central Administrativa",
    sections: [
      { slug: "produtos", label: "Produtos" },
      { slug: "importar", label: "Importar produto por link" },
      { slug: "usuarios", label: "Usuários" },
      { slug: "pedidos", label: "Pedidos" },
      { slug: "precos", label: "Preços" },
      { slug: "revendedores", label: "Revendedores" },
      { slug: "afiliados", label: "Afiliados" },
      { slug: "comissoes", label: "Comissões" },
      { slug: "permissoes", label: "Permissões" },
      { slug: "configuracoes", label: "Configurações" },
    ],
  },
} satisfies Record<string, { title: string; sections: PortalSection[] }>;

export type PortalKey = keyof typeof portals;

export function PortalOverview({ portal }: { portal: PortalKey }) {
  const p = portals[portal];
  return (
    <div>
      <h1 className="text-3xl font-bold">{p.title}</h1>
      <p className="mt-2 max-w-xl text-muted-foreground">Escolha uma seção no menu. Os dados aparecerão aqui quando as rotas da API estiverem prontas.</p>
      <ul className="mt-8 divide-y border-y">
        {p.sections.map((s) => (
          <li key={s.slug} className="flex justify-between py-3 text-sm">
            <span>{s.label}</span>
            <span className="text-muted-foreground">Aguardando API</span>
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
    <div>
      <h1 className="text-3xl font-bold">{label}</h1>
      <div className="mt-6">
        {q.isPending ? <LoadingState /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => void q.refetch()} /> : null}
      </div>
    </div>
  );
}
