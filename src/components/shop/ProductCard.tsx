import { Link } from "@tanstack/react-router";
import { Heart, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { catalogSource } from "@/lib/api";
import { createSupabaseCatalog } from "@/services/supabaseCatalog";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { canSell } from "@/lib/cart";
import { formatPrice, slugifyProductName, type CatalogProduct } from "@/services/catalog";

export function ProductImage({ src, alt = "", className = "" }: { src?: string | undefined; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed)
    return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`bg-white object-contain ${className}`} />;
  return (
    <div data-testid="image-fallback" className={`flex items-center justify-center bg-secondary text-muted-foreground ${className}`}>
      <Package className="size-10 opacity-40" aria-hidden />
    </div>
  );
}

export const availabilityLabel = (p: CatalogProduct) =>
  p.inStock === false || p.stock === 0 ? "Indisponível" : p.stock == null ? "Estoque a confirmar" : "Disponível";

export const priceLabel = (p: CatalogProduct) =>
  p.customerPrice != null ? formatPrice(p.customerPrice, p.currency) : "Preço sob consulta";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const cart = useCart();
  const unavailable = !canSell(product);
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  // A sessão faz parte da chave para que os preços sejam recalculados ao entrar/sair
  // da conta, inclusive ao voltar à home sem recarregar a aplicação.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);


  const favoriteQuery = useQuery({
    queryKey: ["storefront-favorite", userId, product.slug],
    enabled: !!userId && catalogSource() === "supabase",
    queryFn: async () => {
      const { data, error } = await getSupabase().from("user_favorites").select("product_id").eq("product_id", product.slug).maybeSingle();
      if (error) throw error;
      return !!data;
    },
    staleTime: 15_000,
  });
  const favoriteMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Entre na sua conta para salvar produtos favoritos.");
      if (favoriteQuery.data) {
        const { error } = await getSupabase().from("user_favorites").delete().eq("user_id", userId).eq("product_id", product.slug);
        if (error) throw error;
        return false;
      }
      const { error } = await getSupabase().from("user_favorites").insert({ user_id: userId, product_id: product.slug });
      if (error) throw error;
      return true;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["storefront-favorite", userId] });
      await queryClient.invalidateQueries({ queryKey: ["storefront-favorites", userId] });
      toast.success(saved ? "Produto salvo nos favoritos." : "Produto removido dos favoritos.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const favorite = favoriteQuery.data === true;

  const resellerPriceQuery = useQuery({
    queryKey: ["storefront-reseller-price", userId, product.slug],
    enabled: !!userId && catalogSource() === "supabase",
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: isReseller, error } = await supabase.rpc("has_role", { _role: "revendedor" });
      if (error || isReseller !== true) return null;
      return createSupabaseCatalog().resellerPrice(product.slug);
    },
  });
  const resellerPrice = resellerPriceQuery.data ?? null;
  const hasResellerPrice = resellerPrice != null && product.customerPrice != null;
  const discountPercent = hasResellerPrice && product.customerPrice! > resellerPrice!
    ? Math.round(((product.customerPrice! - resellerPrice!) / product.customerPrice!) * 100)
    : null;
  const hasResellerDiscount = discountPercent != null && discountPercent > 0;

  const secondImage = product.images.length > 1 ? product.images[1] : undefined;
  const addToCart = () => {
    if (cart.add({ slug: product.slug, name: product.name, image: product.images[0] ?? null, maxQty: product.stock })) toast.success("Adicionado ao carrinho");
    else toast.error("Quantidade máxima em estoque já está no carrinho.");
  };

  return (
    <article className="group relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border border-border/70 bg-card p-3 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg focus-within:border-brand/50">
      <Link to="/produto/$slug" params={{ slug: slugifyProductName(product.name) }} className="flex flex-1 flex-col outline-none">
        <div className="relative isolate overflow-hidden rounded-lg bg-white">
          <ProductImage src={product.images[0]} alt={product.name} className="aspect-square w-full object-contain p-3 transition-all duration-500 group-hover:scale-[1.035] group-hover:brightness-[0.96]" />
          {secondImage && (
            <ProductImage src={secondImage} alt={product.name + " — segunda imagem"} className="pointer-events-none absolute inset-0 aspect-square w-full bg-white p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/10 to-transparent pb-3 pt-8 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
            <span className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition-transform duration-300 group-hover:translate-y-0 translate-y-2">
              Comprar agora
            </span>
          </div>
          {hasResellerDiscount && (
            <span
              className="absolute right-2 top-2 inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-white/80 bg-orange-500 px-2 text-xs font-extrabold leading-none text-white shadow-sm"
              aria-label={`Economize ${discountPercent}% em relação ao preço para cliente final`}
              title={`Preço de revenda ${discountPercent}% abaixo do preço para cliente final`}
            >
              -{discountPercent}%
            </span>
          )}
          {unavailable && <span className={`absolute right-2 z-10 rounded-md bg-foreground/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-background shadow-sm ${hasResellerDiscount ? "top-11" : "top-2"}`}>Indisponível</span>}
        </div>
        <div className="flex flex-1 flex-col px-1 pt-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{product.category}</p>
          <p className="line-clamp-2 min-h-[2.75rem] font-display text-sm font-semibold leading-snug transition-colors group-hover:text-brand">{product.name}</p>
          <div className="mt-auto flex min-h-[5.25rem] flex-col pt-3">
            {hasResellerPrice ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand">Seu preço de revenda</p>
                <p className="font-display text-xl font-bold text-foreground">{formatPrice(resellerPrice!, product.currency)}</p>
                <p className="text-xs text-muted-foreground">Preço final: {formatPrice(product.customerPrice!, product.currency)}</p>
                {discountPercent != null && discountPercent > 0 && <span className="mt-1 inline-flex rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">{discountPercent}% de desconto</span>}
              </div>
            ) : (
              <p className="font-display text-xl font-bold tracking-tight">{priceLabel(product)}</p>
            )}
            <p className={`mt-2 text-[11px] ${unavailable ? "text-destructive" : "text-muted-foreground"}`}>{availabilityLabel(product)}</p>
          </div>
        </div>
      </Link>
      <button type="button" onClick={() => { if (!userId) { toast.info("Entre na sua conta para salvar seus favoritos."); window.location.assign("/entrar"); return; } favoriteMutation.mutate(); }} disabled={favoriteMutation.isPending} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} title={favorite ? "Remover dos favoritos" : "Salvar nos favoritos"} className="absolute left-5 top-5 z-20 grid size-9 place-items-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm transition hover:scale-105 hover:text-[#ff681f] disabled:opacity-50">
        <Heart className={favorite ? "size-4 fill-[#ff681f] text-[#ff681f]" : "size-4"} />
      </button>
      <button type="button" disabled={!canSell(product)} onClick={addToCart}
        className="mt-3 h-10 w-full shrink-0 rounded-lg bg-orange-500 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-orange-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
        {unavailable ? "Indisponível" : "Adicionar ao carrinho"}
      </button>
    </article>
  );
}
