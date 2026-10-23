import { createFileRoute } from "@tanstack/react-router";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { portals } from "@/components/portal/portals";
import { RoleGate } from "@/components/portal/RoleGate";

export const Route = createFileRoute("/afiliado")({
  head: () => ({
    meta: [
      { title: "Portal do Afiliado | MCI Comercial" },
      { name: "description", content: "Portal do Afiliado da plataforma comercial MCI." },
      { property: "og:title", content: "Portal do Afiliado | MCI Comercial" },
      { property: "og:description", content: "Portal do Afiliado da plataforma comercial MCI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RoleGate role="afiliado">
      <PortalLayout title={portals.afiliado.title} base="/afiliado" sections={portals.afiliado.sections} />
    </RoleGate>
  ),
});
