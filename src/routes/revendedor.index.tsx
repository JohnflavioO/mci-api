
import { createFileRoute } from "@tanstack/react-router";
import { PortalOverview } from "@/components/portal/portals";
import { requireRole } from "@/lib/requireRole";

export const Route = createFileRoute("/revendedor/")({
  beforeLoad: () => requireRole("revendedor"),
  component: () => <PortalOverview portal="revendedor" />,
});
