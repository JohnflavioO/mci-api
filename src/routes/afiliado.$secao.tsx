
import { createFileRoute } from "@tanstack/react-router";
import { PortalSectionView } from "@/components/portal/portals";
import { requireRole } from "@/lib/requireRole";

export const Route = createFileRoute("/afiliado/$secao")({
  beforeLoad: () => requireRole("afiliado"),
  component: Section,
});

function Section() {
  const { secao } = Route.useParams();
  return <PortalSectionView portal="afiliado" slug={secao} />;
}
