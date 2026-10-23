export const METRIC_DRAG_TYPE = "application/x-bc4-metric";
export type GraphMetric = { selection: string; label: string; unit: string; tech: string; kind: string; color?: string; hidden?: boolean };
export type MetricGraphSettings = { metrics: GraphMetric[]; title?: string; curve?: "line" | "points" | "line_points"; ranges?: Record<string, { min?: number; max?: number }> };
export type MetricGraphGroups = Record<string, MetricGraphSettings>;
export function normalizeUnit(unit: string): string {
  const u = unit.trim();
  return ({ Mbps: "Mbit/s", kbps: "kbit/s", bps: "bit/s" } as Record<string, string>)[u] ?? u;
}
export function metricAxes(metrics: GraphMetric[]): string[] {
  return [...new Set(metrics.map((m) => normalizeUnit(m.unit)))];
}
export function validateMetricDrop(metrics: GraphMetric[], metric: GraphMetric): "duplicate" | "categorical" | "unit" | "thirdUnit" | null {
  if (metrics.some((m) => m.selection === metric.selection)) return "duplicate";
  if (metric.kind !== "numeric") return "categorical";
  if (!metric.unit.trim()) return "unit";
  if (metricAxes([...metrics, metric]).length > 2) return "thirdUnit";
  return null;
}
export function addGraphMetric(settings: MetricGraphSettings, metric: GraphMetric): MetricGraphSettings {
  if (validateMetricDrop(settings.metrics, metric)) return settings;
  const used = settings.metrics.map(seriesColor);
  const color = SERIES_COLORS.find((candidate) => !used.includes(candidate));
  return { ...settings, metrics: [...settings.metrics.map((existing, index) => ({ ...existing, color: seriesColor(existing, index) })), { ...metric, ...(color ? { color: metric.color ?? color } : {}) }] };
}
export const SERIES_COLORS = Array.from({ length: 8 }, (_, i) => `var(--metric-series-${i + 1})`);
export function seriesColor(metric: GraphMetric, index: number): string {
  return metric.color ?? SERIES_COLORS[index % SERIES_COLORS.length] ?? "var(--primary)";
}