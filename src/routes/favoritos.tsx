import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/shop/SiteShell";
import { ProductCard } from "@/components/shop/ProductCard";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { catalogService } from "@/services";

export const Route = createFileRoute("/favoritos")({
  head: () => ({ meta: [{ title: "Meus favoritos | Store House" }] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const session = useQuery({
    queryKey: ["storefront-favorites-session"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return null;
      const { data, error } = await getSupabase().auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    retry: false,
  });
  const favorites = useQuery({
    queryKey: ["storefront-favorites", session.data],
    enabled: !!session.data,
    queryFn: async () => {
      const { data, error } = await getSupabase().from("user_favorites").select("product_id,created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: catalogService.list });
  const products = (catalog.data && !catalog.data.isDemo ? catalog.data.products : []).filter(product => favorites.data?.some(favorite => favorite.product_id === product.slug));

  return <SiteShell>
    <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-orange-50 text-[#ff681f]"><Heart className="size-5" /></span>
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e95b19]">Sua lista pessoal</p><h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Meus favoritos</h1></div>
      </div>
      {!session.isPending && !session.data ? (
        <div className="mt-8 rounded-2xl border border-dashed p-10 text-center">
          <Heart className="mx-auto size-9 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-900">Entre para salvar seus produtos</h2>
          <p className="mt-1 text-sm text-slate-500">Seus favoritos ficam vinculados à sua conta para você consultar depois.</p>
          <Link to="/entrar" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#ff681f] px-5 py-3 text-sm font-bold text-white hover:bg-[#e95712]">Entrar na minha conta <ArrowRight className="size-4" /></Link>
        </div>
      ) : session.isPending || favorites.isPending || catalog.isPending ? (
        <p className="mt-8 text-sm text-slate-500">Carregando seus favoritos…</p>
      ) : favorites.isError || catalog.isError ? (
        <p className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar seus favoritos. Tente novamente mais tarde.</p>
      ) : products.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:gap-5">{products.map(product => <ProductCard key={product.slug} product={product} />)}</div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed p-10 text-center">
          <Heart className="mx-auto size-9 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-900">Sua lista ainda está vazia</h2>
          <p className="mt-1 text-sm text-slate-500">Toque no coração dos produtos para guardá-los aqui.</p>
          <Link to="/catalogo" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#ff681f] px-5 py-3 text-sm font-bold text-white hover:bg-[#e95712]">Explorar produtos <ArrowRight className="size-4" /></Link>
        </div>
      )}
    </main>
  </SiteShell>;
}
