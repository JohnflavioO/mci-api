
import { createFileRoute } from "@tanstack/react-router";
import { PortalSectionView } from "@/components/portal/portals";
import { requireRole } from "@/lib/requireRole";

export const Route = createFileRoute("/revendedor/$secao")({
  beforeLoad: requireRole("revendedor"),
  component: Section,
});

function Section() {
  const { secao } = Route.useParams();

  return <PortalSectionView portal="revendedor" slug={secao} />;
}
