import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X, ZoomIn, Zap, Sun, Thermometer, Palette, Scale, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { SiteShell } from "@/components/shop/SiteShell";
import { ProductComparison } from "@/components/shop/ProductComparison";
import { availabilityLabel, priceLabel, ProductImage } from "@/components/shop/ProductCard";
import { DemoBadge, EmptyState, ErrorState, LoadingState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { canSell } from "@/lib/cart";
import { catalogService } from "@/services";
import { createSupabaseCatalog } from "@/services/supabaseCatalog";
import { catalogSource } from "@/lib/api";
import { formatPrice, slugifyProductName } from "@/services/catalog";

export const Route = createFileRoute("/produto/$slug")({
  head: () => ({
    meta: [
      { title: "Produto | MCI Comercial" },
      { name: "description", content: "Detalhes técnicos, disponibilidade e condições do produto MCI." },
      { property: "og:title", content: "Produto | MCI Comercial" },
      { property: "og:description", content: "Detalhes técnicos, disponibilidade e condições do produto MCI." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const q = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      // URLs antigas com UUID continuam funcionando. Slugs legíveis são resolvidos pelo nome público.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
      const listing = isUuid ? null : await catalogService.list();
      const match = listing?.products.find((product) => slugifyProductName(product.name) === slug);
      const current = isUuid
        ? await catalogService.get(slug)
        : match
          ? await catalogService.get(match.slug)
          : { product: null, isDemo: listing?.isDemo ?? false };

      // O cadastro administrativo mantém a galeria no Supabase. Se a origem pública
      // configurada devolver só a imagem principal, tenta recuperar a galeria completa
      // do mesmo produto no Supabase, sem substituir preço, estoque ou outros dados públicos.
      if (current.product && current.product.images.length <= 1) {
        try {
          const supabaseCatalog = createSupabaseCatalog();
          let gallery: string[] = [];
          // SKU é a chave de correspondência estável entre o catálogo público e o cadastro.
          if (current.product.sku) {
            gallery = await supabaseCatalog.getPublishedImagesBySku(current.product.sku);
          }
          // Compatibilidade para produtos antigos sem SKU ou com SKU diferente entre origens.
          if (gallery.length <= current.product.images.length) {
            const supabaseProducts = await supabaseCatalog.listPublished();
            const normalizedSku = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase("pt-BR");
            const normalizedName = (value: string) => slugifyProductName(value);
            const sameProduct = supabaseProducts.find((product) =>
              (!!current.product?.sku && normalizedSku(product.sku) === normalizedSku(current.product.sku)) ||
              normalizedName(product.name) === normalizedName(current.product?.name ?? "")
            );
            if (sameProduct) {
              const directGallery = await supabaseCatalog.getProductImages(sameProduct.slug);
              if (directGallery.length > gallery.length) gallery = directGallery;
            }
          }
          if (gallery.length > current.product.images.length) {
            return { ...current, product: { ...current.product, images: gallery } };
          }
          console.warn("[product-gallery] Galeria complementar não encontrada ou contém apenas uma imagem.", {
            sku: current.product.sku,
            productName: current.product.name,
            publicImageCount: current.product.images.length,
            supabaseImageCount: gallery.length,
          });
        } catch (error) {
          console.error("[product-gallery] Falha ao recuperar galeria do Supabase:", error);
        }
      }
      return current;
    },
  });
  const cart = useCart();
  const [resellerUserId, setResellerUserId] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const images = q.data?.product?.images?.filter(Boolean) ?? [];
  const activeImage = images[activeImageIndex] ?? images[0];
  useEffect(() => { setActiveImageIndex(0); setLightboxOpen(false); }, [slug]);
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void import("@/lib/supabase").then(({ getSupabase, isSupabaseConfigured }) => {
      if (!active || !isSupabaseConfigured()) return;
      const supabase = getSupabase();
      void supabase.auth.getSession().then(({ data }) => {
        if (active) setResellerUserId(data.session?.user.id ?? null);
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (active) setResellerUserId(session?.user.id ?? null);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
      if (!active) unsubscribe();
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowRight") setActiveImageIndex((index) => (index + 1) % Math.max(images.length, 1));
      if (event.key === "ArrowLeft") setActiveImageIndex((index) => (index - 1 + Math.max(images.length, 1)) % Math.max(images.length, 1));
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; };
  }, [lightboxOpen, images.length]);
  const rp = useQuery({
    queryKey: ["reseller-price", resellerUserId, q.data?.product.id],
    enabled: !!resellerUserId && !!q.data?.product.id && catalogSource() === "supabase",
    retry: false,
    queryFn: async () => {
      const { getSupabase } = await import("@/lib/supabase");
      const sb = getSupabase();
      const { data: session } = await sb.auth.getSession();
      if (!session.session) return null;
      const { data: isReseller, error } = await sb.rpc("has_role", { _role: "revendedor" });
      if (error || isReseller !== true) return null;
      return (await import("@/services/supabaseCatalog")).createSupabaseCatalog().resellerPrice(q.data?.product.id ?? "");
    },
  });
  const isApprovedReseller = rp.data != null;
  const p = q.data?.product;
  // Destaques usam primeiro especificações cadastradas; a descrição só é usada quando
  // o valor aparece junto de um rótulo/contexto técnico explícito.
  const highlights = (() => {
    if (!p) return [];
    const result: { label: string; value: string; icon: typeof Zap }[] = [];
    const add = (label: string, value: string | undefined, icon: typeof Zap) => {
      const clean = value?.trim();
      if (clean && !/^(não informado|n\/a|-)$/i.test(clean) && !result.some((item) => item.label === label)) {
        result.push({ label, value: clean, icon });
      }
    };
    const specs = p.specs ?? [];
    const findSpec = (pattern: RegExp) => specs.find((item) => pattern.test(item.label))?.value;
    add("Potência", findSpec(/pot[eê]ncia nominal|pot[eê]ncia de sa[ií]da|pot[eê]ncia\b/i), Zap);
    add("Iluminância", findSpec(/ilumin[aâ]ncia|lux/i), Sun);
    add("Temperatura de cor", findSpec(/temperatura de cor|cct/i), Thermometer);
    add("Qualidade de cor", findSpec(/\bcri\b|\bra\b|\btlci\b|\bssi\b|tm.?30/i), Palette);
    add("Peso", findSpec(/peso|weight/i), Scale);
    add("Tipo de iluminação", findSpec(/tipo de ilumina[cç][aã]o|fonte de luz|light source/i), Lightbulb);

    const description = p.description ?? "";
    const addFromDescription = (label: string, pattern: RegExp, icon: typeof Zap) => {
      if (result.some((item) => item.label === label)) return;
      const match = description.match(pattern);
      if (match?.[1]) add(label, match[1].replace(/\s+/g, " ").trim(), icon);
    };
    addFromDescription("Potência", /(?:pot[eê]ncia nominal|pot[eê]ncia de sa[ií]da)\s*(?:de|:|=)?\s*(\d+(?:[.,]\d+)?\s*(?:W|watts?)\b)/i, Zap);
    addFromDescription("Iluminância", /((?:at[eé]\s*)?\d[\d.,]*\s*lux\s*(?:a|at)\s*\d+(?:[.,]\d+)?\s*m\b[^.;]*)/i, Sun);
    addFromDescription("Temperatura de cor", /(?:faixa|intervalo|temperatura de cor)\s*(?:de)?\s*(\d[\d.,]*\s*(?:–|-|a)\s*\d[\d.,]*\s*K\b[^.;]*)/i, Thermometer);
    const colorMetrics = [
      ["CRI", /\bCRI\s*[:=]?\s*\d{2,3}\+?\b/i],
      ["TLCI", /\bTLCI\s*[:=]?\s*\d{2,3}\+?\b/i],
      ["SSI", /\bSSI\s*[:=]?\s*\d{2,3}\s*\/\s*\d{2,3}\b/i],
      ["TM-30", /\bTM\s*[- ]?30\s*\d{2,3}\s*\/\s*\d{2,3}\b/i],
    ].map(([label, pattern]) => {
      const match = description.match(pattern as RegExp);
      return match ? match[0].replace(/\s+/g, " ").trim() : null;
    }).filter(Boolean);
    if (!result.some((item) => item.label === "Qualidade de cor") && colorMetrics.length) {
      add("Qualidade de cor", colorMetrics.join(" · "), Palette);
    }
    addFromDescription("Peso", /(?:peso(?: l[ií]quido)?|net weight|weight)\s*[:=]?\s*(\d+(?:[.,]\d+)?\s*(?:kg|g)\b)/i, Scale);
    addFromDescription("Tipo de iluminação", /\b(LED|RGBWW|RGB|Bi-Color|bicolor)\b/i, Lightbulb);
    return result.slice(0, 6);
  })();

  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
        <div className="mb-6 text-sm text-muted-foreground"><Link to="/catalogo" className="transition hover:text-brand">Catálogo</Link><span className="mx-2">/</span><span className="text-foreground">Detalhes do produto</span></div>
        {q.isPending ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : !p ? (
          <EmptyState title="Produto não encontrado"><Link to="/catalogo" className="underline">Voltar ao catálogo</Link></EmptyState>
        ) : (
          <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)] lg:gap-12">
            <section className="min-w-0">
              <div className="group relative overflow-hidden rounded-3xl border border-border/70 bg-white shadow-[0_18px_55px_-35px_rgba(15,23,42,.45)]">
                <button
                  type="button"
                  onClick={() => activeImage && setLightboxOpen(true)}
                  className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-gradient-to-br from-white via-white to-slate-50 p-5 sm:p-10"
                  aria-label="Ampliar imagem do produto"
                  disabled={!activeImage}
                >
                  {activeImage ? (
                    <ProductImage src={activeImage} alt={p.name} className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.025]" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Imagem indisponível</div>
                  )}
                  <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition group-hover:bg-white">
                    <ZoomIn className="h-4 w-4" /> Ampliar imagem
                  </span>
                  {images.length > 1 && <span className="absolute left-4 top-4 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-white">{activeImageIndex + 1} / {images.length}</span>}
                </button>
                {images.length > 1 && <>
                  <button type="button" onClick={() => setActiveImageIndex((i) => (i - 1 + images.length) % images.length)} aria-label="Imagem anterior" className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/95 text-slate-800 shadow-md transition hover:scale-105 hover:bg-white"><ChevronLeft className="h-5 w-5" /></button>
                  <button type="button" onClick={() => setActiveImageIndex((i) => (i + 1) % images.length)} aria-label="Próxima imagem" className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/95 text-slate-800 shadow-md transition hover:scale-105 hover:bg-white"><ChevronRight className="h-5 w-5" /></button>
                </>}
              </div>
              {images.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">Galeria do produto</p>
                    <p className="text-xs text-muted-foreground">{images.length} {images.length === 1 ? "imagem" : "imagens"}</p>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {images.map((src, index) => (
                      <button key={src + index} type="button" onClick={() => setActiveImageIndex(index)} aria-label={`Ver imagem ${index + 1}`} aria-pressed={activeImageIndex === index} className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-white p-1 transition sm:h-24 sm:w-24 ${activeImageIndex === index ? "border-brand shadow-[0_0_0_3px_rgba(255,102,31,.12)]" : "border-border hover:border-brand/50"}`}>
                        <ProductImage src={src} alt={`${p.name} — imagem ${index + 1}`} className="h-full w-full rounded-lg object-contain" />
                        {activeImageIndex === index && <span className="absolute inset-x-1 bottom-1 h-0.5 rounded-full bg-brand" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border/70 bg-card px-4 py-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Maximize2 className="h-4 w-4 text-brand" /> Imagens ampliáveis</span>
                <span>Fotos do produto e detalhes visuais</span>
              </div>
              <section className="mt-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Maximize2 className="h-5 w-5" /></span>
                  <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Conheça o equipamento</p><h2 className="mt-1 text-xl font-bold">Descrição do produto</h2></div>
                </div>
                <div className="mt-5 space-y-4 text-sm leading-7 text-foreground/80">
                  {(p.description || "Consulte nossa equipe para mais informações sobre este produto.")
                    .split(/\n\s*\n/)
                    .map((paragraph, index) => paragraph.trim() ? <p key={index} className="whitespace-pre-line">{paragraph.trim()}</p> : null)}
                </div>
              </section>
              <section className="mt-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Dados do fabricante</p><h2 className="mt-1 text-xl font-bold">Ficha técnica</h2></div>
                  <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{p.specs.length} itens</span>
                </div>
                {p.specs.length > 0 ? (
                  <dl className="mt-5 grid gap-2 sm:grid-cols-2">
                    {p.specs.map(({ label: k, value: v }, i) => (
                      <div key={`${k}-${i}`} className="min-w-0 rounded-xl border bg-muted/20 p-3.5">
                        <dt className="text-xs font-medium leading-5 text-muted-foreground">{k}</dt><dd className="mt-1 break-words text-sm font-semibold leading-6 text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="mt-4 rounded-xl bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">As especificações técnicas deste produto serão adicionadas em breve. Consulte nossa equipe para confirmar os detalhes.</p>}
              </section>
            </section>
            <div className="min-w-0 lg:sticky lg:top-6">
              <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {p.category} {q.data?.isDemo && <DemoBadge />}
              </div>
              <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{p.name}</h1>
              {(p.brand || p.sku) && <p className="mt-1 text-sm text-muted-foreground">{[p.brand, p.sku && `SKU ${p.sku}`].filter(Boolean).join(" · ")}</p>}
              <div className="mt-5 border-y border-border py-4">
                {isApprovedReseller ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">Seu preço de revenda</p>
                    <p className="mt-1 font-display text-4xl font-bold text-foreground">{formatPrice(rp.data as number, p.currency)}</p>
                    {p.customerPrice != null && (
                      <>
                        <p className="mt-2 text-sm text-muted-foreground">Preço para cliente final: {formatPrice(p.customerPrice, p.currency)}</p>
                        {p.customerPrice > (rp.data as number) && (
                          <p className="mt-2 inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">
                            {Math.round(((p.customerPrice - (rp.data as number)) / p.customerPrice) * 100)}% de desconto sobre o preço final
                          </p>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preço para cliente final</p>
                    <p className="mt-1 font-display text-4xl font-bold text-foreground">{priceLabel(p)}</p>
                  </>
                )}
              </div>
              {p.customerPrice == null && <p className="text-sm text-muted-foreground">O preço para seu perfil será informado pela plataforma após login.</p>}
              <p className="mt-4 text-sm font-medium">{availabilityLabel(p)}</p>
              {p.stock == null && <p className="mt-1 text-sm text-muted-foreground">Estoque a confirmar — venda indisponível no momento</p>}
              {p.stock != null && <p className="mt-1 text-sm text-muted-foreground">{p.stock > 0 ? `${p.stock} ${p.stock === 1 ? "unidade disponível" : "unidades disponíveis"}` : "Sem estoque no momento"}</p>}
              <Button className="mt-5 h-12 w-full bg-graphite text-graphite-foreground hover:bg-brand hover:text-brand-foreground sm:w-auto sm:px-10" size="lg" disabled={!canSell(p)} onClick={() => { if (cart.add({ slug: p.slug, name: p.name, maxQty: p.stock })) toast.success("Adicionado ao carrinho"); else toast.error("Quantidade máxima em estoque já está no carrinho."); }}>
                Adicionar ao carrinho
              </Button>
              <div className="mt-3"><ProductComparison product={p} /></div>
              </div>
              {highlights.length > 0 && (
                <section className="mt-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-label="Principais características">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand"><Zap className="h-5 w-5" /></span>
                    <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-brand">Resumo técnico</p><h2 className="mt-1 text-lg font-bold">Principais características</h2></div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    {highlights.map(({ label, value, icon: Icon }) => (
                      <div key={label} className="min-w-0 rounded-xl border border-border/70 bg-muted/20 p-3">
                        <dt className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0 text-brand" />{label}</dt>
                        <dd className="mt-1 break-words text-sm font-semibold leading-5 text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">Resumo baseado nas especificações cadastradas e nos dados explicitamente identificados na descrição.</p>
                </section>
              )}
            </div>
          </div>
        )}
      {lightboxOpen && activeImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-3 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-label={`Galeria de imagens de ${p?.name ?? "produto"}`} onClick={() => setLightboxOpen(false)}>
          <button type="button" onClick={() => setLightboxOpen(false)} aria-label="Fechar visualização" className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"><X className="h-6 w-6" /></button>
          <div className="absolute left-5 top-5 text-sm font-medium text-white/75">{p?.name} <span className="ml-2 text-white/50">{activeImageIndex + 1} / {images.length}</span></div>
          {images.length > 1 && <button type="button" onClick={(event) => { event.stopPropagation(); setActiveImageIndex((i) => (i - 1 + images.length) % images.length); }} aria-label="Imagem anterior" className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6"><ChevronLeft className="h-7 w-7" /></button>}
          <div className="flex h-full w-full max-w-6xl items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <ProductImage src={activeImage} alt={p?.name ?? "Imagem do produto"} className="max-h-[82vh] w-full object-contain" />
          </div>
          {images.length > 1 && <button type="button" onClick={(event) => { event.stopPropagation(); setActiveImageIndex((i) => (i + 1) % images.length); }} aria-label="Próxima imagem" className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6"><ChevronRight className="h-7 w-7" /></button>}
          {images.length > 1 && <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2 overflow-x-auto px-4">{images.map((src, index) => <button key={src + index} type="button" onClick={(event) => { event.stopPropagation(); setActiveImageIndex(index); }} aria-label={`Selecionar imagem ${index + 1}`} className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 bg-white p-0.5 ${activeImageIndex === index ? "border-brand" : "border-white/25"}`}><ProductImage src={src} alt="" className="h-full w-full object-contain" /></button>)}</div>}
        </div>
      )}
      </div>
    </SiteShell>
  );
}
