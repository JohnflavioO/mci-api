import { Link } from "@tanstack/react-router";
import { ShoppingBag, Menu, X, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useCart } from "@/lib/cart";

const nav = [
  { to: "/catalogo", label: "Catálogo" },
  { to: "/revendedor", label: "Revendedores" },
  { to: "/seja-afiliado", label: "Afiliados" },
] as const;

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link to="/" className="group inline-flex items-baseline gap-2 rounded-md font-display focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label="MCI Xpress — início">
      <span className={`text-2xl font-bold tracking-tight ${inverted ? "text-graphite-foreground" : "text-graphite"}`}>MCI<span className="text-brand">.</span></span>
      <span className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${inverted ? "text-graphite-muted" : "text-muted-foreground"}`}>Xpress</span>
    </Link>
  );
}

const linkBase = "relative rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function SiteShell({ children }: { children: ReactNode }) {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-8 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Principal" className="hidden flex-1 items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className={`${linkBase} text-foreground/70 hover:text-foreground`} activeProps={{ className: `${linkBase} text-foreground after:absolute after:inset-x-3 after:-bottom-[17px] after:h-0.5 after:rounded-full after:bg-brand` }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/entrar" className="hidden h-10 items-center gap-2 rounded-md bg-graphite px-4 text-sm font-semibold text-graphite-foreground transition hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:inline-flex">
              <UserRound className="size-4" /> Entrar
            </Link>
            <Link to="/carrinho" className="relative grid size-10 place-items-center rounded-md text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={count > 0 ? `Carrinho, ${count} ${count === 1 ? "item" : "itens"}` : "Carrinho"}>
              <ShoppingBag className="size-5" strokeWidth={1.75} />
              {count > 0 && (
                <span className="absolute right-0.5 top-0.5 grid min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-[18px] text-brand-foreground ring-2 ring-background">{count}</span>
              )}
            </Link>
            <button type="button" className="grid size-10 place-items-center rounded-md border border-border text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} aria-controls="menu-mobile">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="menu-mobile" aria-label="Principal" className="border-t border-border bg-background px-4 pb-5 pt-2 md:hidden">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-md px-3 text-base font-semibold text-foreground/80 hover:bg-secondary" activeProps={{ className: "flex min-h-12 items-center rounded-md border-l-2 border-brand bg-secondary px-3 text-base font-semibold text-foreground" }}>{n.label}</Link>
            ))}
            <Link to="/entrar" onClick={() => setOpen(false)} className="mt-3 flex h-12 items-center justify-center gap-2 rounded-md bg-graphite text-base font-semibold text-graphite-foreground">
              <UserRound className="size-4" /> Entrar
            </Link>
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t-2 border-brand bg-graphite text-graphite-foreground">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:py-14">
          <div className="lg:col-span-2">
            <Logo inverted />
            <p className="mt-4 max-w-sm text-sm leading-6 text-graphite-muted">Tecnologia profissional, atendimento especializado e oportunidades para quem quer crescer no mercado audiovisual.</p>
            <p className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-graphite-muted">
              <ShieldCheck className="size-4 text-brand" /> Não informe senhas ou dados de pagamento fora dos fluxos oficiais.
            </p>
          </div>
          <div className="text-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-graphite-foreground">Loja</p>
            <Link to="/catalogo" className="mt-4 block text-graphite-muted transition hover:text-brand">Catálogo de produtos</Link>
            <Link to="/carrinho" className="mt-2.5 block text-graphite-muted transition hover:text-brand">Meu carrinho</Link>
            <Link to="/meus-pedidos" className="mt-2.5 block text-graphite-muted transition hover:text-brand">Meus pedidos</Link>
          </div>
          <div className="text-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-graphite-foreground">Seja parceiro</p>
            <Link to="/cadastro" className="mt-4 block text-graphite-muted transition hover:text-brand">Seja revendedor</Link>
            <Link to="/seja-afiliado" className="mt-2.5 block text-graphite-muted transition hover:text-brand">Seja afiliado</Link>
            <Link to="/entrar" className="mt-2.5 block text-graphite-muted transition hover:text-brand">Acessar minha conta</Link>
          </div>
        </div>
        <div className="border-t border-graphite-foreground/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-graphite-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>© {new Date().getFullYear()} MCI Xpress. Todos os direitos reservados.</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="size-3.5" /> Conexão via HTTPS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
