import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/shop/SiteShell";
import { ProductCard } from "@/components/shop/ProductCard";
import { DemoBadge } from "@/components/shop/states";
import { categories, demoProducts } from "@/lib/demo-data";
import { fromDemo } from "@/services/catalog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MCI Comercial — Equipamentos audiovisuais" },
      { name: "description", content: "Nova plataforma de vendas da MCI para clientes, revendedores e afiliados." },
      { property: "og:title", content: "MCI Comercial — Equipamentos audiovisuais" },
      { property: "og:description", content: "Nova plataforma de vendas da MCI para clientes, revendedores e afiliados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <SiteShell>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-[1.4fr_1fr] md:py-28">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent">Nova operação MCI</p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.05] md:text-6xl">Equipamento profissional, condições para quem vende.</h1>
            <p className="mt-6 max-w-lg opacity-75">Compre direto, revenda com preços exclusivos ou indique e ganhe comissão.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/catalogo" className="rounded-sm bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground">Ver catálogo</Link>
              <Link to="/cadastro" className="rounded-sm border border-primary-foreground/30 px-5 py-3 text-sm font-semibold">Seja parceiro</Link>
            </div>
          </div>
          <div className="grid content-end gap-px border border-primary-foreground/15 text-sm">
            {[["Clientes", "Compre online com entrega."], ["Revendedores", "Tabela exclusiva após aprovação."], ["Afiliados", "Link próprio e comissão por venda."]].map(([t, d]) => (
              <div key={t} className="border-b border-primary-foreground/15 p-5 last:border-0">
                <p className="font-display font-semibold">{t}</p>
                <p className="opacity-70">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link key={c} to="/catalogo" search={{ categoria: c }} className="rounded-full border px-4 py-1.5 text-sm hover:border-foreground">{c}</Link>
          ))}
        </div>
        <div className="mt-12 flex items-center gap-3">
          <h2 className="text-2xl font-bold">Destaques</h2>
          <DemoBadge />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
          {demoProducts.slice(0, 4).map(fromDemo).map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      </section>
    </SiteShell>
  );
}
