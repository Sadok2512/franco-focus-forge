import { createFileRoute } from "@tanstack/react-router";
import { RfModulesPage } from "@/features/rf-modules/RfModulesPage";

export const Route = createFileRoute("/_app/rf")({
  head: () => ({
    meta: [
      { title: "RF Modules — BC4" },
      { property: "og:title", content: "RF Modules — BC4" },
      { property: "og:description", content: "Analyse radio modulaire LTE et NR dans BC4." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Workspace d'analyse radio modulaire : Overshooting Detection, Interference Detector, RACH Performance, DL/UL Throughput Analysis.",
      },
    ],
  }),
  component: RfModulesPage,
});
