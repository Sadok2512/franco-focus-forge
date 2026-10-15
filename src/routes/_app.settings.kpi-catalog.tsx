import { createFileRoute } from "@tanstack/react-router";
import { KpiCatalogPanel } from "@/features/settings/kpi-catalog/KpiCatalogPanel";

export const Route = createFileRoute("/_app/settings/kpi-catalog")({
  head: () => ({ meta: [
    { title: "Catalogue KPI — Paramètres BC4" },
    { name: "description", content: "Définitions versionnées des KPI radio." },
    { property: "og:title", content: "Catalogue KPI — Paramètres BC4" },
    { property: "og:description", content: "Définitions versionnées des KPI radio." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: KpiCatalogPanel,
});
