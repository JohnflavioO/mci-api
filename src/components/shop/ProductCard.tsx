import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import type { Product } from "@/lib/demo-data";

export function ProductImage({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-secondary text-muted-foreground ${className}`}>
      <Package className="size-10 opacity-40" aria-hidden />
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to="/produto/$slug" params={{ slug: product.slug }} className="group block">
      <ProductImage className="aspect-square rounded-md transition group-hover:brightness-95" />
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{product.category}</p>
      <p className="font-display font-semibold leading-tight">{product.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {product.inStock ? "Disponível" : "Indisponível"} · Preço sob consulta
      </p>
    </Link>
  );
}
