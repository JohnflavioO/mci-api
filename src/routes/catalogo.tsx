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
      <div className="mx-auto max-w-7xl px-4 py-5 sm:py-10">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">Catálogo</h1>
          {q.data?.isDemo && <DemoBadge />}
        </div>
        <div className="mt-4 grid gap-5 sm:mt-8 md:grid-cols-[220px_1fr] md:gap-10">
          <aside className="min-w-0 space-y-3 text-sm md:space-y-6">
            <Input placeholder="Buscar produto" defaultValue={search.q} onChange={(e) => set({ q: e.target.value || undefined })} />
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:block md:px-0 md:pb-0">
              <p className="mb-2 hidden font-semibold md:block">Categorias</p>
              {[undefined, ...categories].map((c) => (
                <button key={c ?? "all"} onClick={() => set({ categoria: c })} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold md:block md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-1 md:text-sm ${search.categoria === c ? "border-foreground bg-foreground text-background md:text-foreground" : "border-border bg-card text-muted-foreground md:font-normal"}`}>
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
              <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
                {list.map((p) => <ProductCard key={p.slug} product={p} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
