import { createFileRoute } from "@tanstack/react-router";
import { CellularReferencePanel } from "@/features/settings/cellular-reference/CellularReferencePanel";

export const Route = createFileRoute("/_app/settings/cellular-reference")({
  head: () => ({
    meta: [
      { title: "Référence cellulaire — Paramètres BC4" },
      {
        name: "description",
        content: "Upload et historique de la référence cellulaire (CSV 4G/5G) utilisée par BC4.",
      },
      { property: "og:title", content: "Référence cellulaire — Paramètres BC4" },
      {
        property: "og:description",
        content: "Upload et historique de la référence cellulaire (CSV 4G/5G) utilisée par BC4.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CellularReferencePanel,
});
