import { createFileRoute } from "@tanstack/react-router";
import { LlmConfigPanel } from "@/features/settings/ai/LlmConfigPanel";

export const Route = createFileRoute("/_app/settings/ai")({
  head: () => ({
    meta: [
      { title: "Assistant LLM — Paramètres BC4" },
      {
        name: "description",
        content:
          "Paramètres du fournisseur LLM utilisé par l'Assistant (persistés serveur, clé chiffrée).",
      },
      { property: "og:title", content: "Assistant LLM — Paramètres BC4" },
      {
        property: "og:description",
        content:
          "Paramètres du fournisseur LLM utilisé par l'Assistant (persistés serveur, clé chiffrée).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LlmConfigPanel,
});
