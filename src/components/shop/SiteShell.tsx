import { Link } from "@tanstack/react-router";
import { ShoppingBag, Menu, X, ShieldCheck, UserRound, LayoutDashboard, LogOut, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useCart } from "@/lib/cart";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const nav = [
  { to: "/catalogo", label: "Iluminação", search: { categoria: "Iluminação" } },
  { to: "/catalogo", label: "Acessórios", search: { categoria: "Acessórios" } },
  { to: "/revendedor", label: "Revendedores" },
  { to: "/seja-afiliado", label: "Afiliados" },
] as const;

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link
      to="/"
      className="group inline-flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      aria-label="Store House — início"
    >
      <img
        src={inverted ? "/store-house-logo-dark.png" : "/store-house-logo.png"}
        alt="Store House"
        width={254}
        height={104}
        className="h-auto w-[132px] sm:w-[148px]"
        loading="eager"
      />
    </Link>
  );
}

const linkBase = "relative rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

type AccountDestination = "/admin" | "/revendedor" | "/afiliado" | "/meus-pedidos";
type AccountState = { user: User | null; destination: AccountDestination; loading: boolean };

export function SiteShell({ children }: { children: ReactNode }) {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<AccountState>({ user: null, destination: "/meus-pedidos", loading: true });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAccount({ user: null, destination: "/meus-pedidos", loading: false });
      return;
    }
    const sb = getSupabase();
    let alive = true;
    let requestId = 0;
    const sync = async (user: User | null) => {
      const id = ++requestId;
      if (!user) {
        if (alive) setAccount({ user: null, destination: "/meus-pedidos", loading: false });
        return;
      }
      if (alive) setAccount((prev) => ({ ...prev, user, loading: true }));
      let destination: AccountDestination = "/meus-pedidos";
      try {
        // Prioridade para a Central Administrativa: administradores que visitam a loja
        // devem retornar ao painel, não à página comum de pedidos.
        const [admin, reseller, affiliate] = await Promise.all([
          sb.rpc("has_role", { _role: "admin" }),
          sb.rpc("has_role", { _role: "revendedor" }),
          sb.rpc("has_role", { _role: "afiliado" }),
        ]);
        if (admin.data === true) destination = "/admin";
        else if (reseller.data === true) destination = "/revendedor";
        else if (affiliate.data === true) destination = "/afiliado";
      } catch {
        // Sem confirmação de função, mantém o acesso comum à conta.
      }
      if (alive && id === requestId) setAccount({ user, destination, loading: false });
    };
    void sb.auth.getSession().then(({ data }) => sync(data.session?.user ?? null));
    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      void sync(session?.user ?? null);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const accountLabel = account.loading ? "Carregando" : account.user ? "Minha conta" : "Entrar";
  const accountIcon = account.loading ? <Loader2 className="size-4 animate-spin" /> : account.user ? <LayoutDashboard className="size-4" /> : <UserRound className="size-4" />;
  const accountTo = account.user ? account.destination : "/entrar";
  const signOut = async () => {
    if (!isSupabaseConfigured()) return;
    await getSupabase().auth.signOut();
    setOpen(false);
    window.location.assign("/");
  };
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
            {nav.map((n) => "search" in n ? (
              <Link key={n.label} to="/catalogo" search={n.search} className={`${linkBase} text-foreground/70 hover:text-foreground`} activeProps={{ className: `${linkBase} text-foreground after:absolute after:inset-x-3 after:-bottom-[17px] after:h-0.5 after:rounded-full after:bg-brand` }}>
                {n.label}
              </Link>
            ) : (
              <Link key={n.label} to={n.to} className={`${linkBase} text-foreground/70 hover:text-foreground`} activeProps={{ className: `${linkBase} text-foreground after:absolute after:inset-x-3 after:-bottom-[17px] after:h-0.5 after:rounded-full after:bg-brand` }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to={accountTo} className="group hidden h-9 items-center gap-2 px-2 text-sm font-medium text-foreground/75 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:inline-flex">
              {accountIcon} {accountLabel}
            </Link>
            {account.user && !account.loading && <button type="button" onClick={() => void signOut()} className="hidden h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-foreground transition hover:bg-secondary sm:inline-flex" aria-label="Sair da conta"><LogOut className="size-4" /><span className="hidden lg:inline">Sair</span></button>}
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
            {nav.map((n) => "search" in n ? (
              <Link key={n.label} to="/catalogo" search={n.search} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-md px-3 text-base font-semibold text-foreground/80 hover:bg-secondary" activeProps={{ className: "flex min-h-12 items-center rounded-md border-l-2 border-brand bg-secondary px-3 text-base font-semibold text-foreground" }}>{n.label}</Link>
            ) : (
              <Link key={n.label} to={n.to} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-md px-3 text-base font-semibold text-foreground/80 hover:bg-secondary" activeProps={{ className: "flex min-h-12 items-center rounded-md border-l-2 border-brand bg-secondary px-3 text-base font-semibold text-foreground" }}>{n.label}</Link>
            ))}
            <Link to={accountTo} onClick={() => setOpen(false)} className="mt-3 flex h-12 items-center gap-3 border-y border-border px-3 text-base font-medium text-foreground/80 transition-colors hover:text-brand">
              {accountIcon} {accountLabel}
            </Link>
            {account.user && !account.loading && <button type="button" onClick={() => void signOut()} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border text-base font-semibold" aria-label="Sair da conta"><LogOut className="size-4" /> Sair da conta</button>}
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
            <span>© {new Date().getFullYear()} Store House. Todos os direitos reservados.</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="size-3.5" /> Conexão via HTTPS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
