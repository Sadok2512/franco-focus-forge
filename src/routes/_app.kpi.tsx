import { createFileRoute } from "@tanstack/react-router";
import { ModulePending } from "@/components/bc4/AppShell";

export const Route = createFileRoute("/_app/kpi")({
  head: () => ({ meta: [
    { title: "KPI Analytics — BC4" }, { name: "description", content: "Catalogue KPI radio, formules et comparaisons opérateurs." },
    { property: "og:title", content: "KPI Analytics — BC4" }, { property: "og:description", content: "Catalogue KPI radio, formules et comparaisons opérateurs." },
  ] }),
  component: () => <ModulePending title="KPI Analytics" phase="U7" />,
});
