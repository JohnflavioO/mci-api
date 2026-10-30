import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useState } from "react";
import { ChevronRight, LayoutDashboard, LogOut, Store, PanelLeftClose, PanelLeftOpen, UserRound, type LucideIcon } from "lucide-react";

export type PortalSection = { slug: string; label: string; icon: LucideIcon; group?: string; description?: string };

export function PortalLayout({ title, base, sections }: { title: string; base: "/revendedor" | "/afiliado" | "/admin"; sections: PortalSection[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const adminProfile = useQuery({
    queryKey: ["admin", "portal-sidebar-profile"],
    enabled: base === "/admin" && isSupabaseConfigured(),
    queryFn: async () => {
      const { data, error } = await getSupabase().auth.getUser();
      if (error) throw error;
      const user = data.user;
      if (!user) return { name: "Administrador", email: "", avatar: "" };
      const meta = user.user_metadata ?? {};
      const email = user.email ?? "";
      const name = String(meta.full_name || meta.name || meta.display_name || email.split("@")[0] || "Administrador");
      return { name, email, avatar: String(meta.avatar_url || meta.picture || "") };
    },
    staleTime: 60_000,
    retry: false,
  });
  const resellerProfile = useQuery({
    queryKey: ["reseller", "portal-header-profile"],
    enabled: base === "/revendedor" && isSupabaseConfigured(),
    queryFn: async () => {
      const sb = getSupabase();
      const { data: result, error } = await sb.auth.getUser();
      if (error) throw error;
      const user = result.user;
      if (!user) return { company: "", avatar: "", fullName: "" };
      const meta = user.user_metadata ?? {};
      const { data: application, error: appError } = await sb
        .from("reseller_applications")
        .select("company_name,trade_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (appError) throw appError;
      return {
        company: String(application?.trade_name || application?.company_name || meta.trade_name || meta.company_name || ""),
        avatar: String(meta.avatar_url || ""),
        fullName: String(meta.full_name || meta.name || user.email || ""),
      };
    },
    staleTime: 60_000,
    retry: false,
  });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    if (isSupabaseConfigured()) await getSupabase().auth.signOut();
    await navigate({ to: "/", replace: true });
  };
  const path = useRouterState({ select: (s) => s.location.pathname });
  const current = sections.find((s) => path.startsWith(`${base}/${s.slug}`));
  const groups = [...new Set(sections.map((s) => s.group ?? "Seções"))];
  const item = "flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground";
  const active = { className: "bg-sidebar-accent !text-sidebar-foreground font-medium shadow-[inset_2px_0_0_var(--sidebar-primary)]" };

  return (
    <div className="flex min-h-screen flex-col bg-secondary md:flex-row">
      <aside className={`flex flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:shrink-0 md:overflow-y-auto transition-[width] ${collapsed ? "md:w-[72px]" : "md:w-64"}`}>
        <div className="flex h-20 items-center justify-between gap-2 border-b border-sidebar-border px-5">
          <Link to="/" className="flex min-w-0 items-center gap-3 py-1" aria-label="Store House — início" title="Store House">
            <img
              src="/store-house-logo-dark.png"
              alt="Store House"
              width={254}
              height={104}
              className={collapsed ? "h-auto w-10 shrink-0 object-contain" : "h-auto w-[148px] min-w-0 object-contain"}
              loading="eager"
            />
          </Link>
          <button onClick={() => setCollapsed(!collapsed)} className="hidden rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent md:block" aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        {!collapsed && <p className="px-5 pt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">{title}</p>}
        <nav className="flex flex-1 gap-1 overflow-x-auto p-3 md:flex-col md:gap-0.5">
          {!collapsed && <p className="hidden px-3 pb-1 pt-2 text-[11px] font-medium text-sidebar-primary md:block">Principal</p>}
          <Link to={base} activeOptions={{ exact: true }} className={item} activeProps={active} title="Visão geral">
            <LayoutDashboard className="size-4 shrink-0" />
            {!collapsed && "Visão geral"}
          </Link>
          {groups.map((g) => (
            <div key={g} className="contents md:block">
              {!collapsed && g !== "Principal" && <p className="hidden px-3 pb-1 pt-4 text-[11px] font-medium text-sidebar-primary md:block">{g}</p>}
              {sections.filter((s) => (s.group ?? "Seções") === g).map((s) => (
                <Link key={s.slug} to={`${base}/$secao`} params={{ secao: s.slug }} className={item} activeProps={active} title={s.label}>
                  <s.icon className="size-4 shrink-0" />
                  {!collapsed && s.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      <div className="mt-auto border-t border-sidebar-border p-3">
        <div className={`flex min-w-0 items-center gap-3 rounded-md ${collapsed ? "justify-center" : "px-2 py-2"}`}>
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar-accent text-sm font-semibold text-sidebar-foreground">
            {adminProfile.data?.avatar
              ? <img src={adminProfile.data.avatar} alt="" className="size-full object-cover" />
              : adminProfile.data?.name
                ? adminProfile.data.name.trim().slice(0, 1).toUpperCase()
                : <UserRound className="size-4" />}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/45">Logado como</span>
              {base === "/revendedor" ? (
                <>
                  <span className="mt-0.5 block truncate text-sm font-medium" title={resellerProfile.data?.fullName || "Revendedor"}>
                    {resellerProfile.data?.fullName || (resellerProfile.isLoading ? "Carregando conta…" : "Revendedor")}
                  </span>
                  <span className="block truncate text-xs text-sidebar-foreground/55" title={resellerProfile.data?.company || ""}>
                    {resellerProfile.data?.company || "Portal do revendedor"}
                  </span>
                </>
              ) : base === "/afiliado" ? (
                <>
                  <span className="mt-0.5 block truncate text-sm font-medium">Afiliado</span>
                  <span className="block truncate text-xs text-sidebar-foreground/55">Portal do afiliado</span>
                </>
              ) : (
                <>
                  <span className="mt-0.5 block truncate text-sm font-medium" title={adminProfile.data?.name || "Administrador"}>
                    {adminProfile.data?.name || (adminProfile.isLoading ? "Carregando conta…" : "Administrador")}
                  </span>
                  <span className="block truncate text-xs text-sidebar-foreground/55" title={adminProfile.data?.email || ""}>
                    {adminProfile.data?.email || "Sessão administrativa"}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="border-b bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 md:px-10">
            <div>
              <nav aria-label="Trilha" className="flex items-center gap-1 text-xs text-muted-foreground">
                <Link to={base} className="hover:text-foreground">{title}</Link>
                <ChevronRight className="size-3" />
                <span className="text-foreground">{current?.label ?? "Visão geral"}</span>
              </nav>
              <h1 className="mt-1 text-2xl font-bold">{current?.label ?? "Visão geral"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{current?.description ?? "Acompanhe os principais indicadores da operação comercial."}</p>
            </div>
            <div className="flex items-center gap-3">
              {base === "/revendedor" && (
                <Link to="/revendedor/$secao" params={{ secao: "conta" }} className="flex min-w-0 max-w-[230px] items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-secondary" title="Abrir configurações da conta">
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border bg-secondary text-xs font-bold text-foreground">
                    {resellerProfile.data?.avatar ? <img src={resellerProfile.data.avatar} alt="" className="size-full object-cover" /> : (resellerProfile.data?.fullName || resellerProfile.data?.company || "R").trim().slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-semibold">{resellerProfile.data?.company || "Conta de revendedor"}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{resellerProfile.data?.fullName || "Configurações da conta"}</span>
                  </span>
                </Link>
              )}
              <Link to="/" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary"><Store className="size-4" /> Voltar para a loja</Link>
              <button onClick={() => void signOut()} className="inline-flex h-9 items-center gap-2 rounded-md bg-graphite px-3 text-sm font-medium text-graphite-foreground hover:bg-brand hover:text-brand-foreground"><LogOut className="size-4" /> Sair da conta</button>
            </div>
          </div>
        </header>
        <div className="p-6 md:p-10"><Outlet /></div>
      </div>
    </div>
  );
}
