import { createFileRoute } from "@tanstack/react-router";
import { AssistantPage } from "@/features/assistant/AssistantPage";
import { useFilters } from "@/lib/filters";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BotOff } from "lucide-react";
import { getAiEnabled } from "@/lib/api/client";
import { LoadingSkeleton } from "@/components/bc4/States";

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
  const on = useQuery({ queryKey: ["settings", "ai-enabled"], queryFn: getAiEnabled });
  if (on.isLoading) return <LoadingSkeleton className="m-6 h-64" />;
  if (on.data === false) return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <BotOff className="h-6 w-6 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">Service non activé</h1>
      <p className="max-w-md text-xs text-muted-foreground">L'Assistant IA est désactivé par l'administrateur.</p>
      <Link to="/settings/ai" className="text-xs text-primary underline">Configuration IA</Link>
    </div>
  );
  return <AssistantPage filters={filters} setFilters={set} />;
}
