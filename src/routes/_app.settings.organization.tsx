import { createFileRoute } from "@tanstack/react-router";
import { OrganizationPanel } from "@/features/settings/organization/OrganizationPanel";

export const Route = createFileRoute("/_app/settings/organization")({
  head: () => ({
    meta: [
      { title: "Organisation — Paramètres BC4" },
      { name: "description", content: "Nom, logo et visibilité de l'organisation." },
      { property: "og:title", content: "Organisation — Paramètres BC4" },
      { property: "og:description", content: "Nom, logo et visibilité de l'organisation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrganizationPanel,
});
