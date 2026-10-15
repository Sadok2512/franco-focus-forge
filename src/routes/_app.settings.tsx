import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/settings/SettingsLayout";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Administration — Paramètres BC4" },
      {
        name: "description",
        content:
          "Paramètres et administration de BC4 : utilisateurs, géographie, KPI, IA, apparence, organisation, version.",
      },
      { property: "og:title", content: "Administration — Paramètres BC4" },
      {
        property: "og:description",
        content:
          "Paramètres et administration de BC4 : utilisateurs, géographie, KPI, IA, apparence, organisation, version.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsLayout,
});
