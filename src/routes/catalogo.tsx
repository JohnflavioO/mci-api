import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteShell } from "@/components/shop/SiteShell";
import { ProductCard } from "@/components/shop/ProductCard";
import { DemoBadge, EmptyState, ErrorState, LoadingState } from "@/components/shop/states";
import { Input } from "@/components/ui/input";
import { catalogService } from "@/services";
import { categoriesOf, filterCatalog } from "@/services/catalog";

type Search = { q?: string | undefined; categoria?: string | undefined; disponivel?: boolean | undefined };

export const Route = createFileRoute("/catalogo")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s["q"] === "string" ? s["q"] : undefined,
    categoria: typeof s["categoria"] === "string" ? s["categoria"] : undefined,
    disponivel: s["disponivel"] === true || s["disponivel"] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Catálogo | MCI Comercial" },
      { name: "description", content: "Pesquise e filtre os produtos da MCI por categoria e disponibilidade." },
      { property: "og:title", content: "Catálogo | MCI Comercial" },
      { property: "og:description", content: "Pesquise e filtre os produtos da MCI por categoria e disponibilidade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Catalog,
});

function Catalog() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/catalogo" });
  const q = useQuery({ queryKey: ["catalog"], queryFn: catalogService.list });
  const set = (patch: Partial<Search>) => void navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

  const all = q.data?.products ?? [];
  const categories = categoriesOf(all);
  const list = filterCatalog(all, search);

  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Catálogo</h1>
          {q.data?.isDemo && <DemoBadge />}
        </div>
        <div className="mt-8 grid gap-10 md:grid-cols-[220px_1fr]">
          <aside className="space-y-6 text-sm">
            <Input placeholder="Buscar produto" defaultValue={search.q} onChange={(e) => set({ q: e.target.value || undefined })} />
            <div>
              <p className="mb-2 font-semibold">Categorias</p>
              {[undefined, ...categories].map((c) => (
                <button key={c ?? "all"} onClick={() => set({ categoria: c })} className={`block py-1 ${search.categoria === c ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {c ?? "Todas"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!search.disponivel} onChange={(e) => set({ disponivel: e.target.checked || undefined })} />
              Somente disponíveis
            </label>
          </aside>
          <div>
            {q.isPending ? (
              <LoadingState rows={4} />
            ) : q.isError ? (
              <ErrorState message="Não foi possível carregar o catálogo." onRetry={() => void q.refetch()} />
            ) : list.length === 0 ? (
              <EmptyState title="Nenhum produto encontrado">Ajuste a busca ou os filtros.</EmptyState>
            ) : (
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
                {list.map((p) => <ProductCard key={p.slug} product={p} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
