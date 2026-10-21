import i18n from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { URL_KEYS } from "@/features/kpi/workspace-model";
import { KpiWorkspace } from "@/features/kpi/KpiWorkspace";

export const Route = createFileRoute("/_app/kpi")({
  head: () => ({
    meta: [
      { title: "KPI Analytics — BC4" },
      {
        name: "description",
        content: i18n.t("kpi.49c60a76f5cb"),
      },
    ],
  }),
  // Additional URL fields belong to KPI only; shared operator/technology/band
  // filters continue to use the root schema and useFilters().
  validateSearch: (search: Record<string, unknown>) => ({
    ...Object.fromEntries(
      Object.values(URL_KEYS).map((key) => [
        key,
        Array.isArray(search[key])
          ? search[key].filter((v): v is string => typeof v === "string")
          : undefined,
      ]),
    ),
    metrics: Array.isArray(search["metrics"])
      ? search["metrics"].filter((v): v is string => typeof v === "string")
      : undefined,
    kpi: typeof search["kpi"] === "string" ? search["kpi"] : undefined,
    kpis: Array.isArray(search["kpis"])
      ? search["kpis"].filter((v): v is string => typeof v === "string")
      : undefined,
    commune: Array.isArray(search["commune"])
      ? search["commune"].filter((v): v is string => typeof v === "string")
      : undefined,
    insee: Array.isArray(search["insee"])
      ? search["insee"].filter((v): v is string => typeof v === "string")
      : undefined,
    phase: Array.isArray(search["phase"])
      ? search["phase"].filter((v): v is string => typeof v === "string")
      : undefined,
  }),
  component: KpiWorkspace,
});
