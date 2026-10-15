import { createFileRoute } from "@tanstack/react-router";
import { AboutPanel } from "@/features/settings/about/AboutPanel";

export const Route = createFileRoute("/_app/settings/about")({
  head: () => ({
    meta: [
      { title: "À propos & Version — Paramètres BC4" },
      { name: "description", content: "Version, environnement et nouveautés de BC4." },
      { property: "og:title", content: "À propos & Version — Paramètres BC4" },
      { property: "og:description", content: "Version, environnement et nouveautés de BC4." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPanel,
});
