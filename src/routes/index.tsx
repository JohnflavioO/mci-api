import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  AudioLines,
  Camera,
  Cable,
  Headphones,
  Lightbulb,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  Package,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { SiteShell } from "@/components/shop/SiteShell";
import { ProductCard } from "@/components/shop/ProductCard";
import { catalogService } from "@/services";
import { categoriesOf } from "@/services/catalog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MCI Comercial | Tecnologia profissional para quem produz" },
      { name: "description", content: "Explore equipamentos profissionais de áudio, vídeo e iluminação. Soluções MCI para clientes, revendedores e parceiros." },
      { property: "og:title", content: "MCI Comercial | Tecnologia profissional" },
      { property: "og:description", content: "Equipamentos profissionais e soluções para clientes e parceiros MCI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const categoryIcons = [Camera, AudioLines, Lightbulb, Package, Cable, Headphones];

type HeroSlide = { id: string; eyebrow: string; title: string; description: string | null; image_url: string; mobile_image_url: string | null; button_label: string; button_url: string; open_in_new_tab: boolean; sort_order: number };

function Index() {
  const [term, setTerm] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const heroSlides = useQuery({ queryKey: ["homepage-hero-slides"], queryFn: async () => { const { data, error } = await getSupabase().from("homepage_hero_slides").select("id,eyebrow,title,description,image_url,mobile_image_url,button_label,button_url,open_in_new_tab,sort_order").eq("is_active", true).order("sort_order").order("created_at"); if (error) throw error; return (data ?? []) as HeroSlide[]; }, retry: false });
  const slides = heroSlides.data ?? [];
  const activeSlide = slides.length ? slides[Math.min(slideIndex, slides.length - 1)] : undefined;
  useEffect(() => { setSlideIndex(0); }, [slides.length]);
  useEffect(() => { if (slides.length < 2) return; const timer = window.setInterval(() => setSlideIndex((index) => (index + 1) % slides.length), 6000); return () => window.clearInterval(timer); }, [slides.length]);
  const navigate = useNavigate();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: catalogService.list });
  const products = catalog.data && !catalog.data.isDemo ? catalog.data.products : [];
  const categories = categoriesOf(products);
  const featured = products.slice(0, 8);

  const searchCatalog = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void navigate({ to: "/catalogo", search: { q: term.trim() || undefined } });
  };

  return (
    <SiteShell>
      <div className="bg-[#171a1f] text-white">
        <div className="border-b border-white/10 bg-white/[0.035]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-2.5 text-[11px] font-medium tracking-wide text-white/70 sm:justify-start">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="size-3.5 text-[#ff681f]" /> Parceiro de marcas profissionais</span>
            <span className="hidden h-3 w-px bg-white/20 sm:block" />
            <span className="inline-flex items-center gap-2"><Truck className="size-3.5 text-[#ff681f]" /> Atendimento em todo o Brasil</span>
            <span className="hidden h-3 w-px bg-white/20 sm:block" />
            <span>Condições especiais para revendedores aprovados</span>
          </div>
        </div>

        <section className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,104,31,0.12),_transparent_42%),linear-gradient(115deg,#111419_0%,#171a1f_58%,#20242a_100%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#111419] via-[#171a1f]/95 to-[#171a1f]/75" />
          <div className="pointer-events-none absolute -right-32 -top-24 -z-10 size-[34rem] rounded-full bg-[#ff681f]/10 blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-7 sm:py-9 lg:grid-cols-[1.05fr_.95fr] lg:gap-8 lg:py-10">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[#ff681f]/40 bg-[#ff681f]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff8a50]">
                <Sparkles className="size-3.5" /> MCI Comercial
              </p>
              <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-4xl lg:text-5xl">
                Seu próximo equipamento,
                <span className="mt-1 block text-[#ff762f]">sua próxima grande produção.</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/65 sm:text-base sm:leading-7">
                Encontre equipamentos profissionais de áudio, vídeo e iluminação com suporte especializado para escolher melhor e tirar seu projeto do papel.
              </p>

              <form onSubmit={searchCatalog} className="mt-4 flex max-w-xl items-center rounded-xl border border-white/15 bg-white p-1.5 shadow-2xl shadow-black/20 focus-within:border-[#ff762f]">
                <Search className="ml-3 size-5 shrink-0 text-slate-500" />
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="O que você procura? Produto, marca ou modelo"
                  aria-label="Buscar produtos"
                  className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-500"
                />
                <button type="submit" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#ff681f] px-4 text-sm font-semibold text-white transition hover:bg-[#e95712]">
                  Buscar <ArrowRight className="size-4" />
                </button>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link to="/catalogo" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#ff681f] px-5 text-sm font-bold text-white shadow-lg shadow-orange-950/20 transition hover:bg-[#e95712]">
                  Comprar equipamentos <ArrowRight className="size-4" />
                </Link>
                <Link to="/revendedor" className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 px-4 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5">
                  Sou revendedor
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-white/55">
                <span className="font-semibold text-white/75">Acesso rápido:</span>
                {categories.slice(0, 4).map((category) => (
                  <Link key={category} to="/catalogo" search={{ categoria: category }} className="rounded-full border border-white/15 px-3 py-1.5 transition hover:border-[#ff762f]/70 hover:text-white">{category}</Link>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl lg:pl-4">
              <div key={activeSlide?.id ?? "mci-hero-fallback"} className="relative min-h-[300px] overflow-hidden rounded-2xl border border-white/10 bg-[#20242a] shadow-2xl shadow-black/30 sm:min-h-[360px]">
                {activeSlide ? (
                  <>
                    <picture>
                      {activeSlide.mobile_image_url && <source media="(max-width: 639px)" srcSet={activeSlide.mobile_image_url} />}
                      <img src={activeSlide.image_url} alt={activeSlide.title} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
                    </picture>
                    {activeSlide.button_url.startsWith("https://") ? (
                      <a href={activeSlide.button_url} target={activeSlide.open_in_new_tab ? "_blank" : undefined} rel={activeSlide.open_in_new_tab ? "noreferrer" : undefined} aria-label={`Abrir banner: ${activeSlide.title}`} className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#ff681f]" />
                    ) : (
                      <Link to={activeSlide.button_url as "/catalogo"} target={activeSlide.open_in_new_tab ? "_blank" : undefined} rel={activeSlide.open_in_new_tab ? "noreferrer" : undefined} aria-label={`Abrir banner: ${activeSlide.title}`} className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#ff681f]" />
                    )}
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111419]/95 via-[#111419]/35 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-5 sm:p-7">
                      {activeSlide.eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff8a50]">{activeSlide.eyebrow}</p>}
                      <h2 className="mt-2 max-w-sm text-2xl font-semibold leading-tight text-white sm:text-3xl">{activeSlide.title}</h2>
                      {activeSlide.description && <p className="mt-2 max-w-sm text-sm leading-6 text-white/75">{activeSlide.description}</p>}
                      {activeSlide.button_url.startsWith("https://") ? <a href={activeSlide.button_url} target={activeSlide.open_in_new_tab ? "_blank" : undefined} rel={activeSlide.open_in_new_tab ? "noreferrer" : undefined} className="pointer-events-auto relative z-30 mt-4 inline-flex items-center gap-2 rounded-lg bg-[#ff681f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e95712]">{activeSlide.button_label} <ArrowRight className="size-4" /></a> : <Link to={activeSlide.button_url as "/catalogo"} target={activeSlide.open_in_new_tab ? "_blank" : undefined} rel={activeSlide.open_in_new_tab ? "noreferrer" : undefined} className="pointer-events-auto relative z-30 mt-4 inline-flex items-center gap-2 rounded-lg bg-[#ff681f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e95712]">{activeSlide.button_label} <ArrowRight className="size-4" /></Link>}
                    </div>
                    {slides.length > 1 && <div className="absolute right-3 top-3 z-30 flex items-center gap-2"><button type="button" aria-label="Banner anterior" onClick={() => setSlideIndex((i) => (i - 1 + slides.length) % slides.length)} className="grid size-9 place-items-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur transition hover:bg-black/60"><ChevronLeft className="size-4" /></button><button type="button" aria-label="Próximo banner" onClick={() => setSlideIndex((i) => (i + 1) % slides.length)} className="grid size-9 place-items-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur transition hover:bg-black/60"><ChevronRight className="size-4" /></button></div>}
                    {slides.length > 1 && <div className="absolute bottom-3 right-4 z-30 flex gap-1.5">{slides.map((slide, index) => <button key={slide.id} type="button" aria-label={`Mostrar banner ${index + 1}`} onClick={() => setSlideIndex(index)} className={`h-1.5 rounded-full transition-all ${index === slideIndex ? "w-6 bg-[#ff681f]" : "w-2 bg-white/60 hover:bg-white"}`} />)}</div>}
                  </>
                ) : <div className="absolute inset-0 flex flex-col justify-end bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#3a2b24] via-[#20242a] to-[#111419] p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff8a50]">MCI Xpress · Equipamentos profissionais</p><h2 className="mt-3 max-w-sm text-2xl font-semibold leading-tight text-white sm:text-3xl">Encontre equipamentos para sua próxima produção.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-white/70">Marcas, produtos e soluções profissionais para áudio, vídeo e iluminação.</p><Link to="/catalogo" className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-[#ff681f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e95712]">Explorar catálogo <ArrowRight className="size-4" /></Link></div>}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="border-b bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 px-4 py-5">
          <div className="flex items-center gap-3 py-3 sm:px-5 sm:py-1 sm:first:pl-0"><ShieldCheck className="size-5 text-[#ff681f]" /><div><p className="text-sm font-semibold">Compra com confiança</p><p className="mt-0.5 text-xs text-muted-foreground">Relacionamento direto com a MCI</p></div></div>
          <div className="flex items-center gap-3 py-3 sm:px-5 sm:py-1"><Headphones className="size-5 text-[#ff681f]" /><div><p className="text-sm font-semibold">Atendimento especializado</p><p className="mt-0.5 text-xs text-muted-foreground">Suporte para encontrar a solução certa</p></div></div>
          <div className="flex items-center gap-3 py-3 sm:px-5 sm:py-1"><ShoppingBag className="size-5 text-[#ff681f]" /><div><p className="text-sm font-semibold">Programa de parceiros</p><p className="mt-0.5 text-xs text-muted-foreground">Condições exclusivas após aprovação</p></div></div>
        </div>
      </section>

      <section className="bg-[#f1f2f4]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e95b19]">Seleção MCI</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Produtos em destaque</h2>
              <p className="mt-2 text-sm text-muted-foreground">Conheça os equipamentos disponíveis no catálogo.</p>
            </div>
            <Link to="/catalogo" className="inline-flex items-center gap-2 text-sm font-semibold hover:text-[#e95b19]">Explorar produtos <ArrowRight className="size-4" /></Link>
          </div>
          {catalog.isPending ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{[0,1,2,3].map((i) => <div key={i} className="animate-pulse rounded-2xl bg-white p-3"><div className="aspect-square rounded-xl bg-slate-200" /><div className="mt-4 h-3 w-1/3 rounded bg-slate-200" /><div className="mt-2 h-4 w-3/4 rounded bg-slate-200" /></div>)}</div>
          ) : featured.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {featured.map((product) => <div key={product.slug} className="rounded-2xl border border-slate-200/80 bg-white p-3 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5 sm:p-4"><ProductCard product={product} /></div>)}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <Package className="mx-auto size-8 text-slate-400" />
              <p className="mt-3 font-semibold">Novidades em breve</p>
              <p className="mt-1 text-sm text-muted-foreground">Estamos organizando os produtos para apresentar informações confiáveis.</p>
              <Link to="/catalogo" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#e95b19]">Abrir catálogo <ArrowRight className="size-4" /></Link>
            </div>
          )}
        </div>
      </section>


      <section className="mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e95b19]">Encontre o que precisa</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Explore por categoria</h2>
            <p className="mt-2 text-sm text-muted-foreground">Acesse rapidamente as linhas de equipamentos.</p>
          </div>
          <Link to="/catalogo" className="inline-flex items-center gap-2 text-sm font-semibold hover:text-[#e95b19]">Ver catálogo completo <ArrowRight className="size-4" /></Link>
        </div>
        {categories.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((category, index) => {
              const Icon = categoryIcons[index % categoryIcons.length]!;
              const count = products.filter((p) => p.category === category).length;
              return <Link key={category} to="/catalogo" search={{ categoria: category }} className="group rounded-2xl border bg-white p-4 transition duration-200 hover:-translate-y-1 hover:border-[#ff681f]/50 hover:shadow-lg hover:shadow-slate-900/5 sm:p-5">
                <span className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-[#fff0e8] group-hover:text-[#e95b19]"><Icon className="size-5" /></span>
                <p className="mt-5 text-sm font-semibold leading-snug">{category}</p>
                <p className="mt-1 text-xs text-muted-foreground">{count} {count === 1 ? "produto" : "produtos"}</p>
              </Link>;
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed bg-white px-6 py-10 text-center">
            <Package className="mx-auto size-8 text-slate-400" />
            <p className="mt-3 font-semibold">Estamos preparando o catálogo</p>
            <p className="mt-1 text-sm text-muted-foreground">Os produtos serão exibidos aqui assim que estiverem publicados.</p>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl bg-[#171a1f] px-6 py-10 text-white sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between lg:px-14">
          <div className="absolute -right-12 -top-24 size-72 rounded-full bg-[#ff681f]/15 blur-3xl" />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff8a50]">Cresça com a MCI</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Sua próxima oportunidade pode começar aqui.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 sm:text-base">Tenha acesso a uma operação pensada para clientes, revendedores e afiliados.</p>
          </div>
          <div className="relative mt-7 flex shrink-0 flex-wrap gap-3 lg:mt-0 lg:pl-8">
            <Link to="/cadastro" className="inline-flex items-center gap-2 rounded-xl bg-[#ff681f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#e95712]">Seja parceiro <ArrowRight className="size-4" /></Link>
            <Link to="/revendedor" className="inline-flex items-center rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold transition hover:bg-white/5">Conheça o programa</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
