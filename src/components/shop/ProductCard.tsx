import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { canSell } from "@/lib/cart";
import { formatPrice, type CatalogProduct } from "@/services/catalog";

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
  p.inStock === null ? "Disponibilidade sob consulta" : p.inStock ? "Disponível" : "Indisponível";

export const priceLabel = (p: CatalogProduct) =>
  p.customerPrice != null ? formatPrice(p.customerPrice, p.currency) : "Preço sob consulta";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const cart = useCart();
  const unavailable = !canSell(product);
  return (
    <div className="flex h-full flex-col">
    <Link to="/produto/$slug" params={{ slug: product.slug }} className="group block">
      <ProductImage src={product.images[0]} alt={product.name} className="aspect-square w-full rounded-md transition group-hover:brightness-95" />
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{product.category}</p>
      <p className="font-display font-semibold leading-tight">{product.name}</p>
      <p className="mt-2 font-display text-lg font-bold">{priceLabel(product)}</p>
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
