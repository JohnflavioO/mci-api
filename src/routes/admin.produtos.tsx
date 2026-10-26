import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ImageOff, Images, PackagePlus, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { createSupabaseCatalog, type SupabaseCatalogProduct } from "@/services/supabaseCatalog";
import { categoriesOf, filterCatalog, formatPrice } from "@/services/catalog";
import { EmptyState, ErrorState, LoadingState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

type ProductForm = {
  id?: string;
  name: string;
  brand: string;
  sku: string;
  category: string;
  description: string;
  customerPrice: string;
  resellerPrice: string;
  images: string[];
  imageFiles: File[];
  stock: string;
  stockConfirmed: boolean;
  status: "draft" | "published";
};

const emptyForm: ProductForm = {
  name: "", brand: "", sku: "", category: "", description: "",
  customerPrice: "", resellerPrice: "", images: [], imageFiles: [], stock: "", stockConfirmed: false, status: "draft",
};

const priceNumber = (v: string): number | null => {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function ProductsPage() {
  const qc = useQueryClient();
  const catalog = useMemo(() => createSupabaseCatalog(), []);
  const q = useQuery({ queryKey: ["admin", "supabase-products"], queryFn: catalog.listAdmin, retry: false });
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("");
  const [form, setForm] = useState<ProductForm | null>(null);

  const save = useMutation({
    mutationFn: async (f: ProductForm) => {
      if (!f.name.trim()) throw new Error("Informe o nome do produto.");
      if (f.customerPrice.trim() && priceNumber(f.customerPrice) === null) throw new Error("Preço de venda inválido.");
      if (f.resellerPrice.trim() && priceNumber(f.resellerPrice) === null) throw new Error("Preço de revenda inválido.");
      const customer = priceNumber(f.customerPrice);
      const reseller = priceNumber(f.resellerPrice);
      if (customer !== null && reseller !== null && reseller > customer) throw new Error("O preço de revenda não pode ser maior que o preço ao cliente.");
      if (f.images.some((url) => !/^https:\/\//i.test(url.trim()))) throw new Error("Todas as URLs de imagens precisam usar HTTPS.");
      if (f.images.length + f.imageFiles.length > 10) throw new Error("Cada produto pode ter no máximo 10 imagens.");
      if (f.status === "published" && f.images.length + f.imageFiles.length === 0) {
        throw new Error("Para publicar o produto, adicione pelo menos uma imagem à galeria.");
      }
      for (const file of f.imageFiles) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const allowedByName = ["jpg", "jpeg", "png", "webp", "avif"].includes(extension ?? "");
        const allowedByMime = ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type);
        if (!allowedByMime && !allowedByName) throw new Error(`Formato de imagem não permitido: "${file.name}" (tipo ${file.type || "não informado"}). Use JPG, PNG, WebP ou AVIF.`);
        if (file.size > 8 * 1024 * 1024) throw new Error(`A imagem "${file.name}" ultrapassa o limite de 8 MB.`);
      }
      const stock = f.stock.trim() === "" ? null : Number(f.stock);
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw new Error("Estoque disponível deve ser um número inteiro maior ou igual a zero.");
      // Produtos novos com fotos locais precisam ser criados como rascunho primeiro:
      // a galeria só pode ser gravada depois que o produto tiver um ID. Publicamos no final.
      const publishAfterImages = f.status === "published" && f.imageFiles.length > 0;
      const id = await catalog.saveAdmin({
        ...(f.id ? { id: f.id } : {}), name: f.name, brand: f.brand, sku: f.sku, category: f.category,
        description: f.description, status: publishAfterImages ? "draft" : f.status, customerPrice: customer,
        resellerPrice: reseller, imageUrl: f.images[0] ?? "",
      });
      await catalog.setStock(id, stock, f.stockConfirmed);
      const savedImageUrls = await catalog.saveProductImages(id, f.images, f.imageFiles);
      const persistedImageUrls = await catalog.getProductImages(id);
      if (persistedImageUrls.length !== savedImageUrls.length) {
        throw new Error(`A galeria não foi salva integralmente: ${persistedImageUrls.length} de ${savedImageUrls.length} imagens confirmadas no banco. Tente salvar novamente.`);
      }
      if (publishAfterImages) {
        await catalog.saveAdmin({
          id, name: f.name, brand: f.brand, sku: f.sku, category: f.category,
          description: f.description, status: "published", customerPrice: customer,
          resellerPrice: reseller, imageUrl: savedImageUrls[0] ?? "",
        });
      }
      return id;
    },
    onSuccess: async () => {
      toast.success("Produto salvo no Supabase. Se você adicionou fotos, elas foram enviadas e a galeria foi conferida.");
      setForm(null);
      await qc.invalidateQueries({ queryKey: ["admin", "supabase-products"] });
      await qc.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const products = q.data ?? [];
  const list = useMemo(() => filterCatalog(products, { q: term, categoria: cat || undefined }), [products, term, cat]) as typeof products;
  const cats = categoriesOf(products);

  const editProduct = (p: SupabaseCatalogProduct) => setForm({
    id: p.slug, name: p.name, brand: p.brand ?? "", sku: p.sku ?? "",
    category: p.category ?? "", description: p.description ?? "",
    customerPrice: p.customerPrice == null ? "" : String(p.customerPrice),
    resellerPrice: p.resellerPrice == null ? "" : String(p.resellerPrice),
    images: [...p.images], imageFiles: [], stock: p.stock == null ? "" : String(p.stock), stockConfirmed: p.stockConfirmed, status: p.status,
  });

  const field = (key: Exclude<keyof ProductForm, "id" | "status">, value: string) => setForm((old) => old ? { ...old, [key]: value } : old);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Catálogo</p>
            <h2 className="mt-1 text-xl font-bold">Gestão de produtos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cadastre, edite e organize os produtos diretamente no Supabase.</p>
          </div>
          <Button onClick={() => setForm({ ...emptyForm })} className="gap-2"><Plus className="size-4" /> Novo produto</Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por nome, marca ou SKU" className="pl-9" />
          </div>
          {cats.length > 0 && <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Filtrar categoria">
            <option value="">Todas as categorias</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>}
          <div className="flex items-center rounded-lg border bg-background px-3 text-sm text-muted-foreground">{products.length} {products.length === 1 ? "produto" : "produtos"}</div>
        </div>
      </section>

      {form && (
        <section className="rounded-xl border bg-card p-5 shadow-sm md:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">{form.id ? "Editar produto" : "Novo produto"}</h3>
              <p className="text-sm text-muted-foreground">As alterações serão gravadas no banco de dados do Supabase.</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Fechar formulário" onClick={() => setForm(null)}><X className="size-4" /></Button>
          </div>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            <div className="space-y-1.5"><Label htmlFor="product-name">Nome do produto *</Label><Input id="product-name" required maxLength={200} value={form.name} onChange={(e) => field("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="product-brand">Marca</Label><Input id="product-brand" maxLength={100} value={form.brand} onChange={(e) => field("brand", e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="product-sku">SKU / Código</Label><Input id="product-sku" maxLength={64} value={form.sku} onChange={(e) => field("sku", e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="product-category">Categoria</Label><select id="product-category" value={form.category} onChange={(e) => field("category", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Selecione uma categoria</option>{["Iluminação", "Acessórios", "Áudio", "Vídeo", "Cabos e Conexões", "Suportes e Estruturas", "Outros"].map((category) => <option key={category} value={category}>{category}</option>)}{form.category && !["Iluminação", "Acessórios", "Áudio", "Vídeo", "Cabos e Conexões", "Suportes e Estruturas", "Outros"].includes(form.category) && <option value={form.category}>{form.category} (categoria atual)</option>}</select><p className="text-xs text-muted-foreground">A categoria define em qual seção do catálogo o produto será exibido.</p></div>
            <div className="space-y-1.5"><Label htmlFor="product-customer-price">Preço ao cliente (R$)</Label><Input id="product-customer-price" inputMode="decimal" value={form.customerPrice} onChange={(e) => field("customerPrice", e.target.value)} placeholder="0,00" /></div>
            <div className="space-y-1.5"><Label htmlFor="product-reseller-price">Preço de revenda (R$)</Label><Input id="product-reseller-price" inputMode="decimal" value={form.resellerPrice} onChange={(e) => field("resellerPrice", e.target.value)} placeholder="0,00" /></div>
            <div className="space-y-1.5"><Label htmlFor="product-stock">Quantidade em estoque</Label><Input id="product-stock" type="number" min={0} step={1} inputMode="numeric" value={form.stock} onChange={(e) => field("stock", e.target.value)} placeholder="Não informado" /></div>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm md:col-span-2"><input type="checkbox" checked={form.stockConfirmed} onChange={(e) => setForm((old) => old ? { ...old, stockConfirmed: e.target.checked } : old)} disabled={form.stock.trim() === "" || Number(form.stock) <= 0} /><span><span className="font-medium">Estoque confirmado pela MCI</span><span className="mt-0.5 block text-xs text-muted-foreground">Marque somente após confirmar a quantidade real. Importar produto nunca confirma o estoque automaticamente.</span></span></label>
            <div className="space-y-3 md:col-span-2 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Images className="mt-0.5 size-5 text-brand" />
                <div><Label htmlFor="product-images">Galeria de imagens do produto</Label><p className="mt-1 text-xs text-muted-foreground">Adicione até 10 fotos. Use as setas para mudar a ordem das fotos. A primeira será a imagem principal exibida no catálogo. Recomendado: imagens quadradas de 1200 × 1200 px, JPG, PNG, WebP ou AVIF, até 8 MB por arquivo.</p></div>
              </div>
              <label htmlFor="product-images" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition hover:border-brand hover:bg-muted/40">
                <Upload className="size-6 text-brand" /><span className="text-sm font-semibold">Selecionar fotos do computador</span><span className="text-xs text-muted-foreground">Você pode selecionar várias imagens de uma vez</span>
                <input id="product-images" type="file" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={(e) => {
                  const input = e.currentTarget;
                  const files = Array.from(input.files ?? []);
                  // Limpa o input para permitir selecionar novamente o mesmo arquivo.
                  input.value = "";
                  if (!files.length) return;
                  const allowed = (file: File) => {
                    const ext = file.name.split(".").pop()?.toLowerCase();
                    return ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) ||
                      (!file.type && ["jpg", "jpeg", "png", "webp", "avif"].includes(ext ?? ""));
                  };
                  const invalid = files.find((file) => !allowed(file));
                  if (invalid) { toast.error(`Formato não aceito: ${invalid.name}. Use JPG, PNG, WebP ou AVIF.`); return; }
                  const tooLarge = files.find((file) => file.size > 8 * 1024 * 1024);
                  if (tooLarge) { toast.error(`A imagem "${tooLarge.name}" ultrapassa o limite de 8 MB.`); return; }
                  setForm((old) => {
                    if (!old) return old;
                    const combined = [...old.imageFiles, ...files];
                    if (old.images.length + combined.length > 10) {
                      toast.error(`Limite de 10 imagens: já existem ${old.images.length} salvas e você tentou adicionar ${combined.length} novas.`);
                      return old;
                    }
                    toast.success(`${files.length} ${files.length === 1 ? "imagem selecionada" : "imagens selecionadas"}. Clique em “Salvar produto” para enviar.`);
                    return { ...old, imageFiles: combined };
                  });
                }} />
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {form.images.map((url, index) => <div key={url} className="relative overflow-hidden rounded-lg border bg-muted">
                  <img src={url} alt={`Foto ${index + 1}`} className="aspect-square w-full object-contain" />
                  <div className="flex items-center justify-between gap-1 p-2 text-xs"><span className="truncate">{index === 0 ? "Principal" : `Foto ${index + 1}`}</span><div className="flex shrink-0 items-center gap-0.5"><button type="button" aria-label="Mover foto para cima" title="Mover para cima" disabled={index === 0} className="rounded p-1 hover:bg-background disabled:opacity-30" onClick={() => setForm((old) => { if (!old || index === 0) return old; const images=[...old.images]; [images[index - 1], images[index]] = [images[index], images[index - 1]]; return {...old,images}; })}><ChevronUp className="size-3.5" /></button><button type="button" aria-label="Mover foto para baixo" title="Mover para baixo" disabled={index === form.images.length - 1} className="rounded p-1 hover:bg-background disabled:opacity-30" onClick={() => setForm((old) => { if (!old || index >= old.images.length - 1) return old; const images=[...old.images]; [images[index], images[index + 1]] = [images[index + 1], images[index]]; return {...old,images}; })}><ChevronDown className="size-3.5" /></button><button type="button" aria-label="Remover foto" className="rounded p-1 hover:bg-background" onClick={() => setForm((old) => old ? { ...old, images: old.images.filter((_, i) => i !== index) } : old)}><Trash2 className="size-3.5" /></button></div></div>
                </div>)}
                {form.imageFiles.map((file, index) => <div key={`${file.name}-${index}-${file.size}`} className="relative overflow-hidden rounded-lg border bg-muted">
                  <img src={URL.createObjectURL(file)} alt={file.name} className="aspect-square w-full object-contain" />
                  <div className="flex items-center justify-between gap-1 p-2 text-xs"><span className="truncate">{form.images.length + index === 0 ? "Principal (nova)" : file.name}</span><div className="flex shrink-0 items-center gap-0.5"><button type="button" aria-label="Mover foto nova para cima" title="Mover para cima" disabled={index === 0} className="rounded p-1 hover:bg-background disabled:opacity-30" onClick={() => setForm((old) => { if (!old || index === 0) return old; const imageFiles=[...old.imageFiles]; [imageFiles[index - 1], imageFiles[index]] = [imageFiles[index], imageFiles[index - 1]]; return {...old,imageFiles}; })}><ChevronUp className="size-3.5" /></button><button type="button" aria-label="Mover foto nova para baixo" title="Mover para baixo" disabled={index === form.imageFiles.length - 1} className="rounded p-1 hover:bg-background disabled:opacity-30" onClick={() => setForm((old) => { if (!old || index >= old.imageFiles.length - 1) return old; const imageFiles=[...old.imageFiles]; [imageFiles[index], imageFiles[index + 1]] = [imageFiles[index + 1], imageFiles[index]]; return {...old,imageFiles}; })}><ChevronDown className="size-3.5" /></button><button type="button" aria-label="Remover foto selecionada" className="rounded p-1 hover:bg-background" onClick={() => setForm((old) => old ? { ...old, imageFiles: old.imageFiles.filter((_, i) => i !== index) } : old)}><Trash2 className="size-3.5" /></button></div></div>
                </div>)}
              </div>
              {form.imageFiles.length > 0 && <div role="status" className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm"><strong>{form.imageFiles.length} {form.imageFiles.length === 1 ? "nova imagem selecionada" : "novas imagens selecionadas"}</strong><span className="text-muted-foreground"> — ainda não salvas. Clique em “Salvar produto” para enviar e gravar a galeria.</span></div>}
              {form.images.length + form.imageFiles.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma foto adicionada. Você poderá salvar o produto sem imagens e adicioná-las depois.</p>}
            </div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="product-description">Descrição</Label><textarea id="product-description" rows={4} maxLength={20000} value={form.description} onChange={(e) => field("description", e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
            <div className="space-y-1.5"><Label htmlFor="product-status">Status</Label><select id="product-status" value={form.status} onChange={(e) => setForm((old) => old ? { ...old, status: e.target.value as ProductForm["status"] } : old)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="draft">Rascunho</option><option value="published">Publicado</option></select></div>
            <div className="flex items-end justify-end gap-2 md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar produto"}</Button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div><h3 className="font-semibold">Todos os produtos</h3><p className="text-sm text-muted-foreground">Rascunhos e produtos publicados</p></div>
          <PackagePlus className="size-5 text-muted-foreground" />
        </div>
        {q.isPending ? <div className="p-5"><LoadingState /></div>
          : q.isError ? <div className="p-5"><ErrorState message={q.error.message} onRetry={() => void q.refetch()} /></div>
          : list.length === 0 ? <div className="p-8 text-center">
              <EmptyState title={term || cat ? "Nenhum resultado encontrado" : "Seu catálogo começa aqui"}>
                {term || cat ? "Altere os filtros e tente novamente." : "Cadastre o primeiro produto para começar a montar seu catálogo."}
              </EmptyState>
              {!term && !cat && <Button className="mt-4 gap-2" onClick={() => setForm({ ...emptyForm })}><Plus className="size-4" /> Cadastrar produto</Button>}
            </div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Produto</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Preço cliente</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Ações</th></tr></thead>
              <tbody className="divide-y">{list.map((p) => <tr key={p.slug} className="transition-colors hover:bg-muted/30">
                <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">{p.images[0] ? <img src={p.images[0]} alt="" className="size-full object-cover" /> : <ImageOff className="size-4 text-muted-foreground" />}</div><div className="min-w-0"><p className="max-w-[280px] truncate font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.brand || "Sem marca"}</p></div></div></td>
                <td className="px-4 py-3 text-muted-foreground">{p.sku || "—"}</td><td className="px-4 py-3">{p.category || "—"}</td><td className="px-4 py-3">{p.customerPrice != null ? formatPrice(p.customerPrice, p.currency) : "—"}</td>
                <td className="px-4 py-3"><span className={p.status === "published" ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700" : "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700"}>{p.status === "published" ? "Publicado" : "Rascunho"}</span></td>
                <td className="px-5 py-3 text-right"><div className="inline-flex gap-2"><Link to="/produto/$slug" params={{ slug: p.slug }} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Visualizar</Link><Button variant="outline" size="sm" className="gap-1.5" onClick={() => editProduct(p)}><Pencil className="size-3.5" /> Editar</Button></div></td>
              </tr>)}</tbody>
            </table></div>}
      </section>
      <p className="text-xs text-muted-foreground">Os preços de revenda são exibidos somente neste painel administrativo. O acesso aos dados é validado pelo Supabase RLS.</p>
    </div>
  );
}
