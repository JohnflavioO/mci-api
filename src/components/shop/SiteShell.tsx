import { Link } from "@tanstack/react-router";
import { ShoppingBag, Heart, Menu, X, ShieldCheck, UserRound, LayoutDashboard, LogOut, Loader2, Minus, Plus, Trash2, ArrowRight } from "lucide-react";
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
      className="group inline-flex shrink-0 items-center rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      aria-label="Store House — início"
    >
      <img
        src={inverted ? "/store-house-logo-dark.png" : "/store-house-logo.png"}
        alt="Store House"
        width={254}
        height={104}
        className="h-auto w-[164px] sm:w-[176px]"
        loading="eager"
      />
    </Link>
  );
}

const linkBase = "relative rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

type AccountDestination = "/admin" | "/revendedor" | "/afiliado" | "/meus-pedidos";
type AccountState = { user: User | null; destination: AccountDestination; loading: boolean };
const shortUserName = (user: User | null) => { const meta = user?.user_metadata ?? {}; const raw = String(meta.full_name || meta.name || meta.display_name || user?.email?.split("@")[0] || "").trim(); return raw.split(" ")[0] || "Minha conta"; };

export function SiteShell({ children }: { children: ReactNode }) {
  const { count, items, drawerOpen, closeDrawer, setQty, remove } = useCart();
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

  const accountLabel = account.loading ? "Carregando" : account.user ? shortUserName(account.user) : "Entrar";
  const accountIcon = account.loading ? <Loader2 className="size-4 animate-spin" /> : account.user ? <LayoutDashboard className="size-4" /> : <UserRound className="size-4" />;
  const accountTo = account.user ? account.destination : "/entrar";
  const signOut = async () => {
    if (!isSupabaseConfigured()) return;
    await getSupabase().auth.signOut();
    setOpen(false);
    window.location.assign("/");
  };
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [drawerOpen, closeDrawer]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-6 px-4 sm:px-6">
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
            <Link to="/favoritos" className="relative grid size-10 place-items-center rounded-md text-foreground transition hover:bg-secondary hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label="Meus favoritos" title="Meus favoritos">
              <Heart className="size-5" strokeWidth={1.8} />
            </Link>
            <Link to={accountTo} className="group hidden h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-foreground/75 transition-colors hover:bg-secondary hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:inline-flex" title={account.user ? "Acessar minha conta" : "Entrar"}>
              {accountIcon} <span className="max-w-[110px] truncate">{accountLabel}</span>
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
            <Link to="/favoritos" onClick={() => setOpen(false)} className="flex h-12 items-center gap-3 px-3 text-base font-medium text-foreground/80 hover:text-brand"><Heart className="size-4" /> Meus favoritos</Link>
            <Link to={accountTo} onClick={() => setOpen(false)} className="mt-1 flex h-12 items-center gap-3 border-y border-border px-3 text-base font-medium text-foreground/80 transition-colors hover:text-brand">
              {accountIcon} {accountLabel}
            </Link>
            {account.user && !account.loading && <button type="button" onClick={() => void signOut()} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border text-base font-semibold" aria-label="Sair da conta"><LogOut className="size-4" /> Sair da conta</button>}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      {drawerOpen && (
        <div className="fixed inset-0 z-[80]" role="presentation">
          <button type="button" aria-label="Fechar carrinho" onClick={closeDrawer} className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[2px] animate-in fade-in duration-200" />
          <aside role="dialog" aria-modal="true" aria-labelledby="slide-cart-title" className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-orange-100 text-[#e95b19]"><ShoppingBag className="size-5" /></span>
                <div><h2 id="slide-cart-title" className="text-lg font-extrabold text-slate-900">Seu carrinho</h2><p className="text-xs text-slate-500">{count} {count === 1 ? "item" : "itens"} adicionados</p></div>
              </div>
              <button type="button" onClick={closeDrawer} aria-label="Fechar carrinho" className="grid size-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X className="size-5" /></button>
            </div>
            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <ShoppingBag className="size-12 text-slate-300" /><p className="mt-4 font-bold text-slate-900">Seu carrinho está vazio</p><p className="mt-1 text-sm text-slate-500">Adicione produtos para continuar sua compra.</p>
                <button type="button" onClick={closeDrawer} className="mt-5 rounded-lg bg-[#ff681f] px-5 py-3 text-sm font-bold text-white hover:bg-[#e95712]">Explorar produtos</button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-5">
                  <div className="flex items-center justify-between border-b border-slate-100 py-4 text-xs text-slate-500"><span>Produtos adicionados</span><Link to="/carrinho" onClick={closeDrawer} className="font-semibold text-[#e95b19] hover:underline">Ver carrinho completo</Link></div>
                  <ul className="divide-y divide-slate-100">
                    {items.map(item => (
                      <li key={item.slug} className="flex gap-3 py-5">
                        <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                          {item.image ? <img src={item.image} alt={item.name} className="size-full object-contain" /> : <div className="grid size-full place-items-center"><ShoppingBag className="size-7 text-slate-300" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link to="/produto/$slug" params={{slug:item.slug}} onClick={closeDrawer} className="line-clamp-2 text-sm font-bold leading-5 text-slate-900 hover:text-[#e95b19]">{item.name}</Link>
                          <p className="mt-1 text-xs text-slate-500">Preço e disponibilidade confirmados no checkout</p>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="inline-flex h-9 items-center overflow-hidden rounded-lg border border-slate-200">
                              <button type="button" aria-label="Diminuir quantidade" disabled={item.qty <= 1} onClick={() => setQty(item.slug,item.qty-1)} className="grid size-9 place-items-center text-slate-600 hover:bg-slate-50 disabled:opacity-30"><Minus className="size-3.5" /></button>
                              <span className="min-w-8 text-center text-xs font-bold tabular-nums">{item.qty}</span>
                              <button type="button" aria-label="Aumentar quantidade" disabled={item.maxQty != null && item.qty >= item.maxQty} onClick={() => setQty(item.slug,item.qty+1)} className="grid size-9 place-items-center text-slate-600 hover:bg-slate-50 disabled:opacity-30"><Plus className="size-3.5" /></button>
                            </div>
                            <button type="button" onClick={() => remove(item.slug)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition hover:text-red-600"><Trash2 className="size-3.5" /> Remover</button>
                          </div>
                          {item.maxQty != null && <p className="mt-1.5 text-[11px] text-slate-400">Estoque disponível: {item.maxQty}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-slate-200 bg-slate-50 px-5 py-5">
                  <p className="text-xs leading-5 text-slate-500">O valor final, descontos aplicáveis e opções de frete serão apresentados na finalização da compra.</p>
                  <Link to="/carrinho" onClick={closeDrawer} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 transition hover:border-[#ff681f] hover:text-[#e95b19]">Ver e editar carrinho</Link>
                  <Link to="/checkout" onClick={closeDrawer} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff681f] text-sm font-extrabold text-white shadow-lg shadow-orange-200 transition hover:bg-[#e95712]">Finalizar compra <ArrowRight className="size-4" /></Link>
                  <button type="button" onClick={closeDrawer} className="mt-3 w-full py-1 text-xs font-semibold text-slate-500 hover:text-slate-900">Continuar comprando</button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
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
