
import { createFileRoute } from "@tanstack/react-router";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { portals } from "@/components/portal/portals";
import { requireAdmin } from "@/lib/requireAdmin";

export const Route = createFileRoute("/admin")({
  beforeLoad: requireAdmin,
  head: () => ({
    meta: [
      { title: "Central Administrativa | MCI Comercial" },
      {
        name: "description",
        content: "Central Administrativa da plataforma comercial MCI.",
      },
      {
        property: "og:title",
        content: "Central Administrativa | MCI Comercial",
      },
      {
        property: "og:description",
        content: "Central Administrativa da plataforma comercial MCI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <PortalLayout
      title={portals.admin.title}
      base="/admin"
      sections={portals.admin.sections}
    />
  ),
});

