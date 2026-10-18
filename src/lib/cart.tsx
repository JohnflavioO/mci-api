import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Carrinho local: guarda só itens e quantidades. Preços e totais virão da API. */
export type CartItem = { slug: string; name: string; qty: number };

type Cart = {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">) => void;
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
      const found = items.find((i) => i.slug === item.slug);
      save(found ? items.map((i) => (i.slug === item.slug ? { ...i, qty: i.qty + 1 } : i)) : [...items, { ...item, qty: 1 }]);
    },
    setQty: (slug, qty) => save(items.map((i) => (i.slug === slug ? { ...i, qty: Math.max(1, qty) } : i))),
    remove: (slug) => save(items.filter((i) => i.slug !== slug)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart fora do CartProvider");
  return c;
}
