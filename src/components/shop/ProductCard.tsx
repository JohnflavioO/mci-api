import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
    return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`bg-secondary object-contain ${className}`} />;
  return (
    <div data-testid="image-fallback" className={`flex items-center justify-center bg-secondary text-muted-foreground ${className}`}>
      <Package className="size-10 opacity-40" aria-hidden />
    </div>
  );
}

export const availabilityLabel = (p: CatalogProduct) =>
  p.inStock === false || p.stock === 0 ? "Indisponível" : p.stock == null ? "Estoque a confirmar" : (("stockConfirmed" in p) && !p.stockConfirmed) ? "Estoque a confirmar" : "Disponível";

export const priceLabel = (p: CatalogProduct) =>
  p.customerPrice != null ? formatPrice(p.customerPrice, p.currency) : "Preço sob consulta";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const cart = useCart();
  const unavailable = !canSell(product);
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
  const discountPercent = hasResellerPrice
    ? Math.round(((product.customerPrice! - resellerPrice) / product.customerPrice!) * 100)
    : null;

  return (
    <div className="flex h-full flex-col">
    <Link to="/produto/$slug" params={{ slug: slugifyProductName(product.name) }} className="group block">
      <ProductImage src={product.images[0]} alt={product.name} className="aspect-square w-full rounded-md transition group-hover:brightness-95" />
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{product.category}</p>
      <p className="font-display font-semibold leading-tight">{product.name}</p>
      {hasResellerPrice ? (
        <div className="mt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand">Seu preço de revenda</p>
          <p className="font-display text-lg font-bold text-foreground">{formatPrice(resellerPrice!, product.currency)}</p>
          <p className="text-xs text-muted-foreground">Preço final: {formatPrice(product.customerPrice!, product.currency)}</p>
          {discountPercent != null && discountPercent > 0 && <span className="mt-1 inline-flex rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">{discountPercent}% de desconto</span>}
        </div>
      ) : (
        <p className="mt-2 font-display text-lg font-bold">{priceLabel(product)}</p>
      )}
      <p className={`text-xs ${unavailable ? "text-destructive" : "text-muted-foreground"}`}>{availabilityLabel(product)}</p>
    </Link>
    <button type="button" disabled={!canSell(product)}
      onClick={() => { if (cart.add({ slug: product.slug, name: product.name, maxQty: product.stock })) toast.success("Adicionado ao carrinho"); else toast.error("Quantidade máxima em estoque já está no carrinho."); }}
      className="mt-3 h-10 rounded-md bg-graphite text-sm font-semibold text-graphite-foreground transition hover:bg-brand hover:text-brand-foreground disabled:opacity-40">
      {unavailable ? "Indisponível" : "Adicionar ao carrinho"}
    </button>
    </div>
  );
}
