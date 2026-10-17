import { createFileRoute } from "@tanstack/react-router";
import { DictV2Page } from "@/features/dict-v2/DictV2Page";
import { LoadingSkeleton } from "@/components/bc4/States";
import { useFilters } from "@/lib/filters";

export const Route = createFileRoute("/_app/rrc")({
  head: () => ({
    meta: [
      { title: "Dictionnaire RRC — Explorateur de valeurs — BC4" },
      {
        name: "description",
        content:
          "Explorez les paramètres RRC LTE / NR : arbre catalogue (view=catalog) + arbre brut (view=raw), distribution des valeurs par opérateur ou bande, fiche paramètre.",
      },
      { property: "og:title", content: "Dictionnaire RRC — Explorateur de valeurs — BC4" },
      {
        property: "og:description",
        content:
          "Explorez les paramètres RRC LTE / NR : arbre catalogue + arbre brut, distribution par valeur, verdict de comparabilité.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RrcPage,
});

function RrcPage() {
  const { filters } = useFilters();
  if (!filters.project)
    return (
      <div className="p-4">
        <LoadingSkeleton className="h-96" />
      </div>
    );
  return <DictV2Page projectId={filters.project} />;
}
