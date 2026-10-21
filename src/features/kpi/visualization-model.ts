import i18n from "@/lib/i18n";
import type { KpiGroupBy } from "@/lib/api/project-kpi-schemas";
import type { Statistic } from "./workspace-model";

export type VisualizationType =
  "histogram" | "graph" | "table" | "map" | "task_series" | "task_scatter" | "chronogram";
export type CurveType = "points" | "line" | "line_points";
export type ChartConfig = {
  curveType?: CurveType;
  kpiCode: string;
  visualization: VisualizationType;
  xMetric: KpiGroupBy;
  yMetric: string;
  groupBy: KpiGroupBy;
  statistic: Statistic | null;
};
export const VISUALIZATIONS: Record<VisualizationType, string> = {
  get chronogram() {
    return i18n.t("kpi.a7947fb8c07b");
  },
  get histogram() {
    return i18n.t("kpi.86eb05ab111d");
  },
  get graph() {
    return i18n.t("kpi.ef006991fd7c");
  },
  get table() {
    return i18n.t("kpi.e86755d376aa");
  },
  get map() {
    return i18n.t("kpi.8ae525330384");
  },
  get task_series() {
    return i18n.t("kpi.6bbc80081441");
  },
  get task_scatter() {
    return i18n.t("kpi.0966c76fb9af");
  },
};
// Audited /kpi/{code}: aggregate groups only, no observation/pairing contract.
export const XY_UNAVAILABLE = () => i18n.t("kpi.16d2f405b392");
export const MAP_UNAVAILABLE = () => i18n.t("kpi.f0153ab1a288");
export function defaultConfig(kpiCode: string, groupBy: KpiGroupBy): ChartConfig {
  return {
    kpiCode,
    visualization: "histogram",
    xMetric: groupBy,
    yMetric: kpiCode,
    groupBy,
    statistic: null,
  };
}
export const GROUP_LABELS: Record<KpiGroupBy, string> = {
  get none() {
    return i18n.t("kpi.f6306ab41d27");
  },
  get operator() {
    return i18n.t("kpi.16602c56b3e8");
  },
  get band() {
    return i18n.t("kpi.39c716cec99a");
  },
  get operator_band() {
    return i18n.t("kpi.1e186e6f36c5");
  },
  dor: "DOR",
};
