import i18n from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { URL_KEYS } from "@/features/kpi/workspace-model";
import { KpiWorkspace } from "@/features/kpi/KpiWorkspace";

// Tous les champs KPI restent optionnels dans le search : les reducers
// `search` des <Link to="/kpi"> (ProjectPage) n'ont pas à les énumérer.
// Les filtres partagés (URL_KEYS) sont déjà typés par le schéma racine ;
// la route ne retape ici que ses champs propres.
type KpiSearch = {
  metrics?: string[];
  kpi?: string;
  kpis?: string[];
  commune?: string[];
  insee?: string[];
  phase?: string[];
};

export const Route = createFileRoute("/_app/kpi")({
  head: () => ({
    meta: [
      { title: "KPI Analytics — BC4" },
      {
        name: "description",
        content: i18n.t("kpi.49c60a76f5cb"),
      },
      { property: "og:title", content: "KPI Analytics — BC4" },
      { property: "og:description", content: i18n.t("kpi.49c60a76f5cb") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // Additional URL fields belong to KPI only; shared operator/technology/band
  // filters continue to use the root schema and useFilters().
  validateSearch: (search: Record<string, unknown>): KpiSearch => {
    const asList = (value: unknown): string[] | undefined =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
    // Chaque champ ne figure dans l'objet search que s'il est défini (le
    // runtime était déjà identique : une clé `undefined` n'est jamais
    // sérialisée) — ainsi les reducers `search` des <Link to="/kpi">
    // (ProjectPage) restent typés optionnels.
    return Object.fromEntries(
      [
        ...Object.values(URL_KEYS).map((key) => [key, asList(search[key])]),
        ["metrics", asList(search["metrics"])],
        ["kpi", typeof search["kpi"] === "string" ? search["kpi"] : undefined],
        ["kpis", asList(search["kpis"])],
        ["commune", asList(search["commune"])],
        ["insee", asList(search["insee"])],
        ["phase", asList(search["phase"])],
      ].filter(([, value]) => value !== undefined),
    );
  },
  component: KpiWorkspace,
});
