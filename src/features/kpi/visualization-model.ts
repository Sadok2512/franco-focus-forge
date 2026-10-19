import type { KpiGroupBy } from "@/lib/api/project-kpi-schemas";
import type { Statistic } from "./workspace-model";

export type VisualizationType =
  "histogram" | "graph" | "table" | "map" | "task_series" | "task_scatter" | "chronogram";
export type ChartConfig = {
  kpiCode: string;
  visualization: VisualizationType;
  xMetric: KpiGroupBy;
  yMetric: string;
  groupBy: KpiGroupBy;
  statistic: Statistic | null;
};
export const VISUALIZATIONS: Record<VisualizationType, string> = {
  chronogram: "Chronogramme",
  histogram: "Histogramme",
  graph: "Graphique",
  table: "Tableau",
  map: "Carte",
  task_series: "Série (Task Time)",
  task_scatter: "Nuage (vs radio)",
};
// Audited /kpi/{code}: aggregate groups only, no observation/pairing contract.
export const XY_UNAVAILABLE =
  "Mesures non appariables pour cette combinaison d’axes : l’API fournit des agrégats, sans observations appariées ni Task Time.";
export const MAP_UNAVAILABLE =
  "Aucune observation géolocalisée disponible pour ce KPI dans la réponse API. Les agrégats ne permettent pas de positionner des mesures.";
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
  operator: "Opérateur",
  band: "Bande",
  operator_band: "Opérateur + bande",
  dor: "DOR",
};
