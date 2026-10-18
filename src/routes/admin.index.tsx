import { createFileRoute } from "@tanstack/react-router";
import { PortalOverview } from "@/components/portal/portals";

export const Route = createFileRoute("/admin/")({
  component: () => <PortalOverview portal="admin" />,
});
