import { createFileRoute } from "@tanstack/react-router";
import { PortalOverview } from "@/components/portal/portals";

export const Route = createFileRoute("/afiliado/")({
  component: () => <PortalOverview portal="afiliado" />,
});
