import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorState, SuccessState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { categories } from "@/lib/demo-data";
import { ApiError, hasAuthToken } from "@/lib/api";
import {
  IMPORT_ENDPOINTS,
  canPublishPrices,
  isDuplicateError,
  isEndpointPending,
  isMciProductUrl,
  productImportService,
  type ImportPreview,
  type ImportSaveInput,
} from "@/services/productImport";

export const Route = createFileRoute("/admin/importar")({
  head: () => ({
    meta: [
      { title: "Importar produto por link | MCI Comercial" },
      { name: "description", content: "Importe um produto da loja mci.tv para a nova plataforma, com revisão antes de publicar." },
      { property: "og:title", content: "Importar produto por link | MCI Comercial" },
      { property: "og:description", content: "Importe um produto da loja mci.tv com revisão antes de publicar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

type Draft = Omit<ImportSaveInput, "status">;

const toDraft = (p: ImportPreview): Draft => ({
  sourceUrl: p.sourceUrl,
  name: p.name ?? "",
  brand: p.brand ?? "",
  sku: p.sku ?? "",
  description: p.description ?? "",
  specs: p.specs,
  images: p.images,
  targetCategory: "",
  customerPrice: null,
  resellerPrice: null,
});

function PendingNotice({ endpoint }: { endpoint: string }) {
  return (
    <div className="rounded-md border border-accent bg-accent/10 p-4 text-sm">
      <p className="font-semibold">Aguardando endpoint real da API</p>
      <p className="mt-1 text-muted-foreground">
        Esta função depende de <code>{endpoint}</code>, que ainda não existe no servidor. Nada foi importado ou salvo.
      </p>
    </div>
  );
}

function ImportPage() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const urlValid = isMciProductUrl(url);

  const fetchM = useMutation({
    mutationFn: () => productImportService.preview(url.trim()),
    onSuccess: (p) => { setPreview(p); setDraft(toDraft(p)); setConfirmed(false); },
  });
  const saveM = useMutation({
    mutationFn: (status: ImportSaveInput["status"]) => {
      if (!draft) throw new ApiError("Busque o produto antes de salvar.", 400);
      return productImportService.save({ ...draft, status });
    },
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const errors: string[] = [];
  if (draft) {
    if (!draft.name.trim()) errors.push("Informe o nome do produto.");
    if (!draft.targetCategory) errors.push("Escolha a categoria de destino.");
  }
  const canPublish = errors.length === 0 && draft != null && canPublishPrices(draft) && confirmed;

  if (!hasAuthToken()) {
    return (
      <div className="max-w-4xl">
        <h2 className="sr-only">Importar produto por link</h2>
        <p className="mt-4 text-muted-foreground">
          {fetchM.isError ? "Sua sessão expirou. Entre novamente como administrador." : "Entre como administrador para buscar o produto."}
        </p>
        <Button asChild className="mt-6"><Link to="/entrar" search={{ admin: true }}>Entrar como administrador</Link></Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h2 className="sr-only">Importar produto por link</h2>
      <p className="mt-2 text-muted-foreground">Cole o link de um produto da loja www.mci.tv. A busca é feita pelo servidor da MCI.</p>

      <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (urlValid) fetchM.mutate(); }}>
        <Input placeholder="https://www.mci.tv/..." value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL do produto" />
        <Button type="submit" disabled={!urlValid || fetchM.isPending}>{fetchM.isPending ? "Buscando…" : "Buscar produto"}</Button>
      </form>
      {url && !urlValid && <p className="mt-2 text-sm text-destructive">Use um link https de produto da www.mci.tv.</p>}

      <div className="mt-6 space-y-4">
        {fetchM.isError && (isEndpointPending(fetchM.error) ? <PendingNotice endpoint={IMPORT_ENDPOINTS.preview} /> : <ErrorState message={`Falha na extração: ${fetchM.error.message}`} />)}
      </div>

      {preview && draft && (
        <div className="mt-8 space-y-8">
          {preview.duplicates.length > 0 && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-semibold text-destructive">Possível duplicidade</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.duplicates.map((d) => <li key={d.productId}>{d.name} (mesmo {d.matchedBy === "url" ? "link de origem" : "SKU"})</li>)}
              </ul>
            </div>
          )}
          {(preview.missingFields.length > 0 || preview.warnings.length > 0) && (
            <div className="rounded-md border p-4 text-sm">
              {preview.missingFields.length > 0 && <p><strong>Não fornecidos pelo servidor (preencha manualmente se necessário):</strong> {preview.missingFields.join(", ")}</p>}
              {preview.warnings.map((w) => <p key={w} className="text-muted-foreground">{w}</p>)}
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-lg font-semibold sm:col-span-2">Dados do produto</h2>
            <div><Label>Nome</Label><Input className="mt-1" value={draft.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div><Label>Marca</Label><Input className="mt-1" value={draft.brand} placeholder={preview.brand ? "" : "Não encontrada"} onChange={(e) => set("brand", e.target.value)} /></div>
            <div><Label>SKU / código</Label><Input className="mt-1" value={draft.sku} placeholder={preview.sku ? "" : "Não encontrado"} onChange={(e) => set("sku", e.target.value)} /></div>
            <div><Label>Categoria de origem</Label><Input className="mt-1" value={preview.sourceCategory ?? "Não encontrada"} disabled /></div>
            <div className="sm:col-span-2"><Label>Descrição</Label><Textarea className="mt-1" rows={5} value={draft.description} onChange={(e) => set("description", e.target.value)} /></div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Especificações</h2>
            {draft.specs.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma especificação encontrada.</p> : (
              <div className="mt-3 space-y-2">
                {draft.specs.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                    <Input value={s.label} onChange={(e) => set("specs", draft.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <Input value={s.value} onChange={(e) => set("specs", draft.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                    <Button type="button" variant="ghost" onClick={() => set("specs", draft.specs.filter((_, j) => j !== i))}>Remover</Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Imagens</h2>
            <p className="text-sm text-muted-foreground">Apenas pré-visualização dos links originais. O armazenamento definitivo depende de estratégia autorizada no servidor.</p>
            {draft.images.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma imagem encontrada.</p> : (
              <div className="mt-3 flex flex-wrap gap-3">
                {draft.images.map((src) => (
                  <div key={src} className="w-28">
                    <img src={src} alt="" referrerPolicy="no-referrer" className="aspect-square w-full rounded-sm border object-cover" />
                    <button className="mt-1 text-xs underline" onClick={() => set("images", draft.images.filter((x) => x !== src))}>Remover</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-lg font-semibold sm:col-span-2">Destino e preços</h2>
            <div>
              <Label>Categoria de destino</Label>
              <select className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.targetCategory} onChange={(e) => set("targetCategory", e.target.value)}>
                <option value="">Selecione…</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><Label>Preço público de referência (mci.tv)</Label><Input className="mt-1" disabled value={preview.referencePrice != null ? preview.referencePrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Não encontrado"} /></div>
            <div><Label>Preço de venda na nova loja (R$)</Label><Input className="mt-1" type="number" min={0} step="0.01" value={draft.customerPrice ?? ""} onChange={(e) => set("customerPrice", e.target.value === "" ? null : Number(e.target.value))} /></div>
            <div>
              <Label>Preço para revendedores (R$)</Label>
              <Input className="mt-1" type="number" min={0} step="0.01" value={draft.resellerPrice ?? ""} onChange={(e) => set("resellerPrice", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
          </section>

          <section className="space-y-3 border-t pt-6">
            <p className="text-sm text-muted-foreground">Origem: <span className="break-all">{draft.sourceUrl}</span> · a data da importação será registrada ao salvar.</p>
            {errors.map((e) => <p key={e} className="text-sm text-destructive">{e}</p>)}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              Revisei os dados e confirmo a importação.
            </label>
            {saveM.isError && (isEndpointPending(saveM.error) ? <PendingNotice endpoint={IMPORT_ENDPOINTS.save} /> : isDuplicateError(saveM.error) ? <ErrorState message={`Produto duplicado: ${saveM.error.message}`} /> : <ErrorState message={saveM.error.message} />)}
            {saveM.isSuccess && <SuccessState message={`Produto salvo pelo servidor (${saveM.data.status}).`} />}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={errors.length > 0 || saveM.isPending} onClick={() => saveM.mutate("draft")}>Salvar como rascunho</Button>
              <Button disabled={!canPublish || saveM.isPending} onClick={() => saveM.mutate("published")}>Publicar</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
