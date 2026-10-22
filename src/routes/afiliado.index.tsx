
import { createFileRoute } from "@tanstack/react-router";
import { PortalOverview } from "@/components/portal/portals";
import { requireRole } from "@/lib/requireRole";

export const Route = createFileRoute("/afiliado/")({
  beforeLoad: () => requireRole("afiliado"),
  component: () => <PortalOverview portal="afiliado" />,
});
