import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Carrinho local: guarda itens, quantidades e o limite de estoque conhecido. Preços e totais virão da API. */
export type CartItem = { slug: string; name: string; qty: number; maxQty?: number | null };

/** Limita a quantidade entre 1 e o estoque conhecido (null = sem limite informado). */
/** Só vende com estoque conhecido e positivo (estoque "não informado" não é vendável). */
export const canSell = (p: { stock?: number | null; inStock?: boolean | null }) =>
  p.inStock !== false && typeof p.stock === "number" && p.stock > 0;

export function clampQty(qty: number, maxQty?: number | null): number {
  const n = Number.isFinite(qty) ? Math.floor(qty) : 1;
  const min = Math.max(1, n);
  return maxQty != null ? Math.min(min, Math.max(0, maxQty)) : min;
}

type Cart = {
  items: CartItem[];
  /** Retorna false quando o estoque disponível já está todo no carrinho. */
  add: (item: Omit<CartItem, "qty">) => boolean;
  setQty: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  count: number;
};

const Ctx = createContext<Cart | null>(null);
const KEY = "mci-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      /* ignora */
    }
  }, []);
  const save = (next: CartItem[]) => {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };
  const value: Cart = {
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    add: (item) => {
      const max = item.maxQty ?? null;
      if (max !== null && max <= 0) return false;
      const found = items.find((i) => i.slug === item.slug);
      if (found && max !== null && found.qty >= max) return false;
      save(found ? items.map((i) => (i.slug === item.slug ? { ...i, maxQty: max, qty: clampQty(i.qty + 1, max) } : i)) : [...items, { ...item, maxQty: max, qty: 1 }]);
      return true;
    },
    setQty: (slug, qty) => save(items.map((i) => (i.slug === slug ? { ...i, qty: clampQty(qty, i.maxQty) } : i))),
    remove: (slug) => save(items.filter((i) => i.slug !== slug)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart fora do CartProvider");
  return c;
}
