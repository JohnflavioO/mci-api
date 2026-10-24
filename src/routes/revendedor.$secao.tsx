import { createFileRoute } from "@tanstack/react-router";
import { PortalSectionView } from "@/components/portal/portals";
import { ResellerAccountSettings } from "@/components/portal/ResellerAccountSettings";

export const Route = createFileRoute("/revendedor/$secao")({
  component: Section,
});

function Section() {
  const { secao } = Route.useParams();
  if (secao === "conta") return <ResellerAccountSettings />;
  return <PortalSectionView portal="revendedor" slug={secao} />;
}
