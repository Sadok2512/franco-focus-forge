import { createFileRoute } from "@tanstack/react-router";
import { GeographyPanel } from "@/features/settings/geography/GeographyPanel";

export const Route = createFileRoute("/_app/settings/geography")({
  head: () => ({ meta: [
    { title: "Géographie — Paramètres BC4" },
    { name: "description", content: "Import et validation du référentiel de zones CSV/XLSX." },
    { property: "og:title", content: "Géographie — Paramètres BC4" },
    { property: "og:description", content: "Import et validation du référentiel de zones CSV/XLSX." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: GeographyPanel,
});
