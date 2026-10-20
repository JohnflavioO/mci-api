import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ImageOff, Lock, Plus, Search, Send } from "lucide-react";
import { hasAuthToken } from "@/lib/api";
import { listPublishedProducts, publishProduct } from "@/services/adminProducts";
import { categoriesOf, filterCatalog, formatPrice } from "@/services/catalog";
import { EmptyState, ErrorState, LoadingState } from "@/components/shop/states";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos | MCI Xpress" },
      { name: "description", content: "Gestão de produtos da Central Administrativa MCI." },
      { property: "og:title", content: "Produtos | MCI Xpress" },
      { property: "og:description", content: "Gestão de produtos da Central Administrativa MCI." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "products"], queryFn: listPublishedProducts, retry: false });
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("");
  const [draftId, setDraftId] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const logged = hasAuthToken();

  const publish = useMutation({
    mutationFn: publishProduct,
    onSuccess: () => { toast.success("Produto publicado pela API."); setDraftId(""); void qc.invalidateQueries({ queryKey: ["admin", "products"] }); },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setConfirmId(null),
  });

  const list = useMemo(() => filterCatalog(q.data ?? [], { q: term, categoria: cat || undefined }), [q.data, term, cat]);
  const cats = categoriesOf(q.data ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por nome ou SKU" className="h-10 w-full rounded-md border bg-card pl-9 pr-3 text-sm" />
        </div>
        {cats.length > 0 && (
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 rounded-md border bg-card px-3 text-sm" aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <Link to="/admin/$secao" params={{ secao: "importar" }} className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground">
          <Plus className="size-4" /> Importar produto
        </Link>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3 text-sm">
          <span className="font-semibold">Produtos publicados</span>
          <span className="text-xs text-muted-foreground">Rascunhos aparecem quando a API oferecer a listagem administrativa.</span>
        </div>
        {q.isPending ? <div className="p-5"><LoadingState /></div>
          : q.isError ? <div className="p-5"><ErrorState message={q.error.message} onRetry={() => void q.refetch()} /></div>
          : (q.data ?? []).length === 0 ? <div className="p-5"><EmptyState title="Nenhum produto publicado">Importe um produto e publique-o para vê-lo aqui.</EmptyState></div>
          : list.length === 0 ? <div className="p-5"><EmptyState title="Nenhum resultado">Ajuste a busca ou o filtro.</EmptyState></div>
          : (
            <ul className="divide-y">
              {list.map((p) => (
                <li key={p.slug} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary">
                    {p.images[0] ? <img src={p.images[0]} alt="" className="size-full object-cover" /> : <ImageOff className="size-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">SKU {p.sku ?? "—"} · {p.brand || "Sem marca"} · {p.category}</p>
                  </div>
                  <span className="hidden text-sm sm:block">{p.customerPrice != null ? formatPrice(p.customerPrice, p.currency) : "—"}</span>
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">Publicado</span>
                  <Link to="/produto/$slug" params={{ slug: p.slug }} className="text-xs font-medium underline underline-offset-4">Ver</Link>
                </li>
              ))}
            </ul>
          )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Publicar rascunho</h2>
          <p className="mt-1 text-sm text-muted-foreground">Informe o ID retornado ao salvar o rascunho na importação.</p>
          {logged ? (
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draftId.trim()) setConfirmId(draftId.trim()); }}>
              <input value={draftId} onChange={(e) => setDraftId(e.target.value)} placeholder="ID do produto" className="h-10 flex-1 rounded-md border px-3 text-sm" />
              <button disabled={!draftId.trim() || publish.isPending} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                <Send className="size-4" /> Publicar
              </button>
            </form>
          ) : (
            <Link to="/entrar" search={{ admin: true }} className="mt-4 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"><Lock className="size-4" />Entrar como administrador</Link>
          )}
        </div>
        <div className="rounded-lg border border-dashed bg-card p-5">
          <h2 className="font-semibold">Cadastro e edição manual</h2>
          <p className="mt-1 text-sm text-muted-foreground">Indisponível: a API ainda não oferece criação, edição nem listagem administrativa de produtos.</p>
        </div>
      </div>

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar produto {confirmId}?</AlertDialogTitle>
            <AlertDialogDescription>O produto ficará visível no catálogo público. Os preços de revenda continuam protegidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={publish.isPending} onClick={(e) => { e.preventDefault(); if (confirmId) publish.mutate(confirmId); }}>Publicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
