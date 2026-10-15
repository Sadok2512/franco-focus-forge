import { createFileRoute } from "@tanstack/react-router";
import { AiConfigPanel } from "@/features/settings/ai/AiConfigPanel";

export const Route = createFileRoute("/_app/settings/ai")({
  head: () => ({
    meta: [
      { title: "Configuration IA — Paramètres BC4" },
      { name: "description", content: "Paramètres du modèle de l'Assistant IA." },
      { property: "og:title", content: "Configuration IA — Paramètres BC4" },
      { property: "og:description", content: "Paramètres du modèle de l'Assistant IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiConfigPanel,
});
