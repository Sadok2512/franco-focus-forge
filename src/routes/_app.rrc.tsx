import { createFileRoute } from "@tanstack/react-router";
import { DictionaryPage } from "@/features/dictionary/DictionaryPage";
import { LoadingSkeleton } from "@/components/bc4/States";
import { useFilters } from "@/lib/filters";

export const Route = createFileRoute("/_app/rrc")({
  head: () => ({
    meta: [
      { title: "Dictionnaire RRC LTE + NR — BC4" },
      {
        name: "description",
        content:
          "Explorez les messages et paramètres RRC LTE et NR : arbre ASN.1, distribution, matrice opérateur/bande et carte.",
      },
      { property: "og:title", content: "Dictionnaire RRC LTE + NR — BC4" },
      {
        property: "og:description",
        content:
          "Explorez les messages et paramètres RRC LTE et NR : arbre ASN.1, distribution, matrice opérateur/bande et carte.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RrcPage,
});

function RrcPage() {
  const { filters, set } = useFilters();
  if (!filters.project)
    return (
      <div className="p-4">
        <LoadingSkeleton className="h-96" />
      </div>
    );
  const { op, tech, svc, band, dep } = filters;
  return (
    <DictionaryPage
      projectId={filters.project}
      filters={{ op, tech, svc, band, dep }}
      setFilters={set}
    />
  );
}
