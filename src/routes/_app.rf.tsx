import { createFileRoute } from "@tanstack/react-router";
import { RfModulesPage } from "@/features/rf-modules/RfModulesPage";

export const Route = createFileRoute("/_app/rf")({
  head: () => ({
    meta: [
      { title: "RF Modules — BC4" },
      {
        name: "description",
        content:
          "Workspace d'analyse radio modulaire : Overshooting Detection, Interference Detector, RACH Performance, DL/UL Throughput Analysis.",
      },
    ],
  }),
  component: RfModulesPage,
});
