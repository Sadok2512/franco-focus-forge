import { createFileRoute } from "@tanstack/react-router";
import { AssistantPage } from "@/features/assistant/AssistantPage";
import { useFilters } from "@/lib/filters";

export const Route = createFileRoute("/_app/assistant")({
  head: () => ({ meta: [
    { title: "Assistant IA — BC4" },
    { name: "description", content: "Assistant d'analyse radio LTE/NR/EN-DC : réponses sourcées, preuves classées et limites explicites." },
    { property: "og:title", content: "Assistant IA — BC4" },
    { property: "og:description", content: "Assistant d'analyse radio LTE/NR/EN-DC : réponses sourcées, preuves classées et limites explicites." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AssistantRoute,
});

function AssistantRoute() {
  const { filters, set } = useFilters();
  return <AssistantPage filters={filters} setFilters={set} />;
}
