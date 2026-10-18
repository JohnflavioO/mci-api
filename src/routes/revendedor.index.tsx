import { createFileRoute } from "@tanstack/react-router";
import { PortalOverview } from "@/components/portal/portals";

export const Route = createFileRoute("/revendedor/")({
  component: () => <PortalOverview portal="revendedor" />,
});
