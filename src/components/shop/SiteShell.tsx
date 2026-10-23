import { Link } from "@tanstack/react-router";
import { ShoppingBag, Menu, ShieldCheck } from "lucide-react";
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
        <div className="mx-auto flex min-h-[76px] max-w-7xl items-center gap-6 px-4">
          <Logo />
          <nav className="hidden flex-1 items-center gap-2 text-sm font-semibold md:flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-lg px-3 py-2.5 text-foreground/80 transition-colors hover:bg-accent/10 hover:text-accent" activeProps={{ className: "rounded-lg bg-accent/10 px-3 py-2.5 font-bold text-accent" }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm font-semibold">
            <Link to="/entrar" className="hidden rounded-lg border border-border px-4 py-2.5 text-foreground transition hover:border-accent hover:text-accent sm:inline-flex">Entrar</Link>
            <Link to="/carrinho" className="relative" aria-label="Carrinho">
              <ShoppingBag className="size-5 text-foreground" />
              {count > 0 && (
                <span className="absolute -right-2 -top-2 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">{count}</span>
              )}
            </Link>
            <button className="rounded-lg border border-border p-2 text-foreground transition hover:border-accent hover:text-accent md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
              <Menu className="size-5" />
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t bg-background px-4 py-4 text-sm font-semibold md:hidden">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-foreground/85 hover:bg-accent/10 hover:text-accent">{n.label}</Link>
            ))}
            <Link to="/entrar" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-foreground/85 hover:bg-accent/10 hover:text-accent">Entrar</Link>
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-white/10 bg-[#171a1f] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:py-14">
          <div className="lg:col-span-2">
            <p className="font-display text-xl font-bold">MCI<span className="text-[#ff681f]">.</span> Comercial</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Tecnologia profissional, atendimento especializado e oportunidades para quem quer crescer no mercado audiovisual.</p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="size-4" /> Ambiente protegido · navegação segura
            </div>
            <p className="mt-3 max-w-md text-xs leading-5 text-white/40">Não informe senhas ou dados de pagamento fora dos fluxos oficiais da plataforma.</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-white">Loja</p>
            <Link to="/catalogo" className="mt-3 block text-white/60 transition hover:text-[#ff8a50]">Catálogo de produtos</Link>
            <Link to="/carrinho" className="mt-2 block text-white/60 transition hover:text-[#ff8a50]">Meu carrinho</Link>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-white">Seja parceiro</p>
            <Link to="/cadastro" className="mt-3 block text-white/60 transition hover:text-[#ff8a50]">Seja revendedor</Link>
            <Link to="/cadastro" className="mt-2 block text-white/60 transition hover:text-[#ff8a50]">Seja afiliado</Link>
            <Link to="/entrar" className="mt-2 block text-white/60 transition hover:text-[#ff8a50]">Acessar minha conta</Link>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} MCI Comercial. Todos os direitos reservados.</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="size-3.5 text-emerald-400" /> Conexão protegida por HTTPS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
