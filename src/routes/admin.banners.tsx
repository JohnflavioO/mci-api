import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ChangeEvent } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Save, Trash2, Upload, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { AdminGate } from "@/components/portal/AdminGate";

export const Route = createFileRoute("/admin/banners")({
  head: () => ({ meta: [{ title: "Banners da home | MCI Xpress" }] }),
  component: () => <AdminGate><HomepageBannersPage /></AdminGate>,
});

type Slide = {
  id: string; eyebrow: string; title: string; description: string | null;
  image_url: string; mobile_image_url: string | null; button_label: string;
  button_url: string; open_in_new_tab: boolean; sort_order: number; is_active: boolean; is_mini_banner: boolean;
};
type SlideDraft = Omit<Slide, "id">;
const emptySlide = (): SlideDraft => ({
  eyebrow: "MCI Xpress", title: "", description: "", image_url: "",
  mobile_image_url: "", button_label: "Ver produtos", button_url: "/catalogo", open_in_new_tab: false,
  sort_order: 0, is_active: false, is_mini_banner: false,
});

function HomepageBannersPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SlideDraft>(emptySlide());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"desktop" | "mobile" | null>(null);
  const slides = useQuery({
    queryKey: ["admin", "homepage-hero-slides"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("homepage_hero_slides").select("*").order("sort_order").order("created_at");
      if (error) throw error;
      return (data ?? []) as Slide[];
    },
    retry: false,
  });
  const uploadImage = async (kind: "desktop" | "mobile", event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem."); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("A imagem deve ter no máximo 8 MB."); return; }
    setUploading(kind);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${kind}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await getSupabase().storage.from("homepage-banners").upload(path, file, {
        cacheControl: "31536000", upsert: false, contentType: file.type,
      });
      if (error) throw error;
      const { data: publicData } = getSupabase().storage.from("homepage-banners").getPublicUrl(data.path);
      setDraft(current => ({ ...current, [kind === "desktop" ? "image_url" : "mobile_image_url"]: publicData.publicUrl }));
      toast.success(kind === "desktop" ? "Imagem desktop enviada." : "Imagem mobile enviada.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível enviar a imagem.";
      toast.error(message.includes("Bucket not found") ? "O armazenamento de banners ainda não foi configurado. Aplique a migration atualizada do projeto." : message);
    } finally {
      setUploading(null);
    }
  };
  const ImageUploadField = ({ kind, label, url, hint }: { kind: "desktop" | "mobile"; label: string; url: string; hint: string }) => (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      <div className="rounded-lg border border-dashed p-3">
        {url ? <div className="mb-3 overflow-hidden rounded-md bg-muted"><img src={url} alt={`Prévia da imagem ${kind}`} className={kind === "desktop" ? "h-36 w-full object-cover" : "mx-auto h-40 max-w-full object-contain"} /></div> : <div className="mb-3 flex h-24 items-center justify-center rounded-md bg-muted/60 text-sm text-muted-foreground">Nenhuma imagem selecionada</div>}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading !== null} onChange={event => void uploadImage(kind, event)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-2 file:text-background" />
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        {url && <div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-xs text-muted-foreground">{url}</span><Button type="button" size="sm" variant="ghost" onClick={() => setDraft(current => ({ ...current, [kind === "desktop" ? "image_url" : "mobile_image_url"]: "" }))}><X className="mr-1 size-3" />Remover</Button></div>}
      </div>
      <label className="block text-xs text-muted-foreground">Ou cole uma URL HTTPS existente
        <input className={field} value={url} onChange={event => setDraft(current => ({ ...current, [kind === "desktop" ? "image_url" : "mobile_image_url"]: event.target.value }))} placeholder="https://..." />
      </label>
    </div>
  );
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin", "homepage-hero-slides"] });
    await qc.invalidateQueries({ queryKey: ["homepage-hero-slides"] });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim() || !draft.image_url.trim()) throw new Error("Informe o título e a URL HTTPS da imagem.");
      if (!draft.image_url.startsWith("https://")) throw new Error("A imagem precisa usar HTTPS.");
      if (draft.mobile_image_url && !draft.mobile_image_url.startsWith("https://")) throw new Error("A imagem mobile precisa usar HTTPS.");
      if (!(draft.button_url.startsWith("/") || draft.button_url.startsWith("https://"))) throw new Error("O destino deve ser uma rota interna ou URL HTTPS.");
      const payload = { ...draft, title: draft.title.trim(), description: draft.description?.trim() || null, mobile_image_url: draft.mobile_image_url?.trim() || null, updated_at: new Date().toISOString() };
      const request = editingId ? getSupabase().from("homepage_hero_slides").update(payload).eq("id", editingId) : getSupabase().from("homepage_hero_slides").insert(payload);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: async () => { toast.success("Banner salvo."); setDraft(emptySlide()); setEditingId(null); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await getSupabase().from("homepage_hero_slides").delete().eq("id", id); if (error) throw error; },
    onSuccess: async () => { toast.success("Banner removido."); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const edit = (slide: Slide) => { setEditingId(slide.id); setDraft({ ...slide }); };
  const toggle = async (slide: Slide) => {
    const { error } = await getSupabase().from("homepage_hero_slides").update({ is_active: !slide.is_active, updated_at: new Date().toISOString() }).eq("id", slide.id);
    if (error) toast.error(error.message);
    else { toast.success(slide.is_active ? "Banner desativado." : "Banner publicado."); await refresh(); }
  };
  const move = async (slide: Slide, delta: number) => {
    const ordered = [...(slides.data ?? [])].sort((a,b) => a.sort_order-b.sort_order);
    const i = ordered.findIndex(s => s.id === slide.id), j = i + delta;
    if (j < 0 || j >= ordered.length) return;
    const other = ordered[j]!;
    const { error } = await getSupabase().from("homepage_hero_slides").update({ sort_order: other.sort_order, updated_at: new Date().toISOString() }).eq("id", slide.id);
    if (error) { toast.error(error.message); return; }
    const { error: secondError } = await getSupabase().from("homepage_hero_slides").update({ sort_order: slide.sort_order, updated_at: new Date().toISOString() }).eq("id", other.id);
    if (secondError) { toast.error(secondError.message); return; }
    await refresh();
  };
  const field = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Vitrine da loja</p><h2 className="mt-1 text-2xl font-bold">Banners da página inicial</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Gerencie os slides da home. Use imagens reais de produtos, marcas e campanhas autorizadas da MCI. As imagens devem estar hospedadas em URLs HTTPS.</p></header>
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2"><ImagePlus className="size-5 text-brand"/><h3 className="font-semibold">{editingId ? "Editar banner" : "Adicionar banner"}</h3></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Título *<input className={field} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Ex.: Conheça a linha Astera"/></label>
        <label className="text-sm font-medium">Texto de apoio<input className={field} value={draft.description ?? ""} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Frase curta da campanha"/></label>
        <label className="text-sm font-medium">Etiqueta superior<input className={field} value={draft.eyebrow} onChange={e=>setDraft({...draft,eyebrow:e.target.value})} placeholder="Lançamento, marca ou categoria"/></label>
        <div className="sm:col-span-2 grid gap-4 lg:grid-cols-2">
          <ImageUploadField kind="desktop" label="Imagem desktop *" url={draft.image_url} hint="Recomendado: 1600 × 1000 px (proporção 16:10). JPG, PNG, WebP ou AVIF; até 8 MB." />
          <ImageUploadField kind="mobile" label="Imagem mobile (opcional)" url={draft.mobile_image_url ?? ""} hint="Recomendado: 900 × 1200 px (proporção 3:4). A área visível é vertical em celulares; até 8 MB." />
        </div>
        <label className="text-sm font-medium">Texto do botão<input className={field} value={draft.button_label} onChange={e=>setDraft({...draft,button_label:e.target.value})} placeholder="Ver produtos"/></label>
        <label className="min-w-0 text-sm font-medium xl:col-span-2">Link de destino do banner (página do produto)<input className={field} value={draft.button_url} onChange={e=>setDraft({...draft,button_url:e.target.value})} placeholder="/produto/slug-do-produto"/><span className="mt-1 block text-xs font-normal text-muted-foreground">Informe a URL legível do produto, por exemplo /produto/amaran-ray-360c. Os links dos produtos usam o nome do produto na URL. A imagem e o botão abrirão este destino. Também aceita /catalogo ou uma URL HTTPS.</span></label>
        <label className="text-sm font-medium">Comportamento do link<select className={field} value={draft.open_in_new_tab ? "new" : "same"} onChange={e=>setDraft({...draft,open_in_new_tab:e.target.value === "new"})}><option value="same">Abrir na mesma aba</option><option value="new">Abrir em nova aba</option></select><span className="mt-1 block text-xs font-normal text-muted-foreground">Aplica-se ao clique na imagem do banner e no botão.</span></label>\n        <label className="text-sm font-medium">Ordem de exibição<input type="number" min={0} className={field} value={draft.sort_order} onChange={e=>setDraft({...draft,sort_order:Number(e.target.value)||0})}/></label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={draft.is_active} onChange={e=>setDraft({...draft,is_active:e.target.checked})}/> Publicar na home</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={draft.is_mini_banner} onChange={e=>setDraft({...draft,is_mini_banner:e.target.checked, sort_order: e.target.checked ? 999 : draft.sort_order})}/> Usar como mini banner na seção de categorias</label>
        {draft.is_mini_banner && <p className="text-xs text-muted-foreground sm:col-span-2">Este banner será exibido ao lado de Iluminação e Acessórios. Não será exibido no carrossel principal. Mantenha apenas um banner marcado com esta opção.</p>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2"><Button onClick={()=>save.mutate()} disabled={save.isPending || uploading !== null}>{save.isPending || uploading !== null ? <Loader2 className="mr-2 size-4 animate-spin"/> : <Save className="mr-2 size-4"/>}{editingId ? "Salvar alterações" : "Cadastrar banner"}</Button>{editingId && <Button variant="outline" onClick={()=>{setDraft(emptySlide());setEditingId(null);}}>Cancelar edição</Button>}</div>
    </section>
    <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Slides cadastrados</h3><span className="text-xs text-muted-foreground">{slides.data?.length ?? 0} banner(s)</span></div>
      {slides.isPending ? <p className="text-sm text-muted-foreground">Carregando banners…</p> : slides.isError ? <p className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">Não foi possível carregar. Verifique se a migration foi aplicada e se sua conta tem permissão administrativa.</p> : slides.data?.length ? slides.data.map((slide,index)=><article key={slide.id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <div className="h-24 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-40"><img src={slide.image_url} alt="" className="h-full w-full object-cover"/></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{slide.title}</h4><span className={slide.is_active ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800" : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"}>{slide.is_active ? "Publicado" : "Rascunho"}</span></div><p className="mt-1 text-sm text-muted-foreground">{slide.eyebrow} · {slide.button_label} · Ordem {slide.sort_order}{slide.is_mini_banner ? " · Mini banner" : ""}</p><p className="mt-1 truncate text-xs text-muted-foreground">{slide.image_url}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" aria-label="Mover para cima" disabled={index===0} onClick={()=>void move(slide,-1)}><ArrowUp className="size-4"/></Button><Button variant="outline" size="icon" aria-label="Mover para baixo" disabled={index===slides.data!.length-1} onClick={()=>void move(slide,1)}><ArrowDown className="size-4"/></Button><Button variant="outline" onClick={()=>void toggle(slide)}>{slide.is_active ? "Desativar" : "Publicar"}</Button><Button variant="outline" onClick={()=>edit(slide)}>Editar</Button><Button variant="outline" size="icon" aria-label="Excluir banner" onClick={()=>{if(confirm("Excluir este banner permanentemente?")) remove.mutate(slide.id);}}><Trash2 className="size-4"/></Button></div>
      </article>) : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum banner cadastrado. Cadastre o primeiro slide para ativar o carrossel da home.</p>}
    </section>
  </div>;
}
