import { createFileRoute } from "@tanstack/react-router";
import { DictionaryPage } from "@/features/dict-v2/DictV2Page";
import { NoActiveProject } from "@/components/bc4/NoActiveProject";
import { useActiveProject } from "@/lib/activeProject";
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
  const { activeProject } = useActiveProject();
  const { filters, set } = useFilters();
  // 1.11.0 — Source de vérité du projet = store activeProject (sélection
  // explicite via « Ouvrir »). `filters.project` n'est plus lu ici.
  if (!activeProject) return <NoActiveProject scope="Dictionnaire RRC" />;
  // 1.8.0 — Dict pilote 5 filtres : Opérateur, Bande, DR, Plaque, Zone ARCEP.
  const { op, band, dr, plaque, arcep } = filters;
  return (
    <DictionaryPage
      projectId={activeProject.id}
      filters={{ op, band, dr, plaque, arcep }}
      setFilters={set}
    />
  );
}
