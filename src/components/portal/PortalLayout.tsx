import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useState } from "react";
import { ChevronRight, LayoutDashboard, LogOut, Store, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";

export type PortalSection = { slug: string; label: string; icon: LucideIcon; group?: string; description?: string };

export function PortalLayout({ title, base, sections }: { title: string; base: "/revendedor" | "/afiliado" | "/admin"; sections: PortalSection[] }) {
  const [collapsed, setCollapsed] = useState(false);
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
      <aside className={`bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:shrink-0 md:overflow-y-auto transition-[width] ${collapsed ? "md:w-[72px]" : "md:w-64"}`}>
        <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <Link to="/" className="flex items-center gap-2 font-display font-bold">
            <span className="grid size-8 place-items-center rounded-md bg-sidebar-primary text-sm text-sidebar-primary-foreground">M</span>
            {!collapsed && <span>MCI <span className="text-sidebar-primary">Xpress</span></span>}
          </Link>
          <button onClick={() => setCollapsed(!collapsed)} className="hidden rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent md:block" aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        {!collapsed && <p className="px-5 pt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">{title}</p>}
        <nav className="flex gap-1 overflow-x-auto p-3 md:flex-col md:gap-0.5">
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
            <div className="flex items-center gap-2">
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
