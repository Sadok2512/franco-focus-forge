import type { MetricViews } from "./metric-views";

export function isMapOnlyWorkspace({
  metricsTablePane,
  metricCardPanelCount,
  selectedMetrics,
  metricViews,
  kpiCodes,
  kpiPanelCount,
  signalingPanelCount,
}: {
  metricsTablePane: boolean;
  metricCardPanelCount: number;
  selectedMetrics: string[];
  metricViews: MetricViews;
  kpiCodes: string[];
  kpiPanelCount: number;
  signalingPanelCount: number;
}): boolean {
  if (
    metricsTablePane ||
    metricCardPanelCount !== 1 ||
    kpiPanelCount !== 0 ||
    signalingPanelCount !== 0
  )
    return false;
  return (
    (kpiCodes.length === 0 &&
      selectedMetrics.length === 1 &&
      metricViews[selectedMetrics[0]!] === "map") ||
    (selectedMetrics.length === 0 && kpiCodes.length === 1)
  );
}
