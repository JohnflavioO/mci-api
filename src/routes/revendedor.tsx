import { createFileRoute } from "@tanstack/react-router";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { portals } from "@/components/portal/portals";
import { ResellerGate } from "@/components/portal/ResellerGate";

export const Route = createFileRoute("/revendedor")({
  head: () => ({
    meta: [
      { title: "Portal do Revendedor | MCI Comercial" },
      { name: "description", content: "Portal do Revendedor da plataforma comercial MCI." },
      { property: "og:title", content: "Portal do Revendedor | MCI Comercial" },
      { property: "og:description", content: "Portal do Revendedor da plataforma comercial MCI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ResellerGate>
      <PortalLayout title={portals.revendedor.title} base="/revendedor" sections={portals.revendedor.sections} />
    </ResellerGate>
  ),
});
