import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { useState } from "react";
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
  return (
    <Link to="/produto/$slug" params={{ slug: product.slug }} className="group block">
      <ProductImage src={product.images[0]} alt={product.name} className="aspect-square w-full rounded-md transition group-hover:brightness-95" />
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{product.category}</p>
      <p className="font-display font-semibold leading-tight">{product.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {availabilityLabel(product)} · {priceLabel(product)}
      </p>
    </Link>
  );
}
