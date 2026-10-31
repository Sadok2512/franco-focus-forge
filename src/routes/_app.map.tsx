import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/lib/i18n";
import { MapWorkspacePage } from "@/features/map/MapWorkspacePage";
import { validateAnalysisScopeSearch } from "@/lib/analysis-scope";

export const Route = createFileRoute("/_app/map")({
  validateSearch: validateAnalysisScopeSearch,
  head: () => ({
    meta: [
      { title: `${i18n.t("mapWorkspace.title")} — BC4` },
      { name: "description", content: i18n.t("mapWorkspace.description") },
      { property: "og:title", content: `${i18n.t("mapWorkspace.title")} — BC4` },
      { property: "og:description", content: i18n.t("mapWorkspace.description") },
      { property: "og:type", content: "website" },
    ],
  }),
  component: MapWorkspacePage,
});
