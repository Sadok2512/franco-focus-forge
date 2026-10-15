import { createFileRoute } from "@tanstack/react-router";
import { AppearancePanel } from "@/features/settings/appearance/AppearancePanel";

export const Route = createFileRoute("/_app/settings/appearance")({
  head: () => ({ meta: [
    { title: "Apparence — Paramètres BC4" },
    { name: "description", content: "Thème, densité et couleur principale de BC4." },
    { property: "og:title", content: "Apparence — Paramètres BC4" },
    { property: "og:description", content: "Thème, densité et couleur principale de BC4." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AppearancePanel,
});
