import { createFileRoute } from "@tanstack/react-router";
import { PortalSectionView } from "@/components/portal/portals";

export const Route = createFileRoute("/admin/$secao")({
  component: Section,
});

function Section() {
  const { secao } = Route.useParams();
  return <PortalSectionView portal="admin" slug={secao} />;
}
