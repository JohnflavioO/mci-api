
import { createFileRoute } from "@tanstack/react-router";
import { PortalSectionView } from "@/components/portal/portals";
import { requireAdmin } from "@/lib/requireAdmin";

export const Route = createFileRoute("/admin/$secao")({
  beforeLoad: requireAdmin,
  component: Section,
});

function Section() {
  const { secao } = Route.useParams();
  return <PortalSectionView portal="admin" slug={secao} />;
}
