import { Link } from "@tanstack/react-router";
import { ShoppingBag, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useCart } from "@/lib/cart";

const nav = [
  { to: "/catalogo", label: "Catálogo" },
  { to: "/revendedor", label: "Revendedores" },
  { to: "/afiliado", label: "Afiliados" },
] as const;

export function Logo() {
  return (
    <Link to="/" className="font-display text-xl font-bold tracking-tight">
      MCI<span className="text-accent">.</span>
      <span className="ml-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Comercial</span>
    </Link>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
          <Logo />
          <nav className="hidden flex-1 gap-6 text-sm md:flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground font-medium" }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <Link to="/entrar" className="hidden sm:inline">Entrar</Link>
            <Link to="/carrinho" className="relative" aria-label="Carrinho">
              <ShoppingBag className="size-5" />
              {count > 0 && (
                <span className="absolute -right-2 -top-2 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">{count}</span>
              )}
            </Link>
            <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
              <Menu className="size-5" />
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-3 border-t px-4 py-4 text-sm md:hidden">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)}>{n.label}</Link>
            ))}
            <Link to="/entrar" onClick={() => setOpen(false)}>Entrar</Link>
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-3">
          <div>
            <p className="font-display text-lg font-bold">MCI<span className="text-accent">.</span> Comercial</p>
            <p className="mt-2 text-sm opacity-70">Nova plataforma de vendas da MCI.</p>
          </div>
          <div className="text-sm opacity-80">
            <p className="font-semibold">Loja</p>
            <Link to="/catalogo" className="mt-2 block">Catálogo</Link>
            <Link to="/carrinho" className="block">Carrinho</Link>
          </div>
          <div className="text-sm opacity-80">
            <p className="font-semibold">Parceiros</p>
            <Link to="/cadastro" className="mt-2 block">Seja revendedor</Link>
            <Link to="/cadastro" className="block">Seja afiliado</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
