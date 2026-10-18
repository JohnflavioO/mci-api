import { Link, Outlet } from "@tanstack/react-router";
import { Logo } from "@/components/shop/SiteShell";

export type PortalSection = { slug: string; label: string };

export function PortalLayout({ title, base, sections }: { title: string; base: "/revendedor" | "/afiliado" | "/admin"; sections: PortalSection[] }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-sidebar text-sidebar-foreground md:w-64 md:shrink-0">
        <div className="p-5 [&_a]:text-sidebar-foreground"><Logo /></div>
        <p className="px-5 pb-2 text-xs uppercase tracking-[0.2em] text-sidebar-primary">{title}</p>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
          <Link to={base} activeOptions={{ exact: true }} className="whitespace-nowrap rounded-sm px-3 py-2 text-sm hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent font-medium" }}>
            Visão geral
          </Link>
          {sections.map((s) => (
            <Link key={s.slug} to={`${base}/$secao`} params={{ secao: s.slug }} className="whitespace-nowrap rounded-sm px-3 py-2 text-sm hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent font-medium" }}>
              {s.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <div className="border-b bg-accent/15 px-6 py-2 text-xs">
          Área em construção: o acesso real e as permissões serão validados pela API.
        </div>
        <div className="p-6 md:p-10"><Outlet /></div>
      </div>
    </div>
  );
}
