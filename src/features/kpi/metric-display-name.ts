import type { MetricCatalogNode, MetricInfo } from "@/lib/api/metrics-schemas";

/**
 * The catalogue is the only authority for user-facing metric names. API
 * selectors remain storage/query identities and are never displayed when a
 * catalogue display code exists.
 */
export function metricDisplayNameMap(
  nodes: readonly MetricCatalogNode[],
  metrics: readonly MetricInfo[] = [],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const node of nodes) {
    const name = node.display_code_lisible?.trim();
    if (!name) continue;
    if (node.selection) names.set(node.selection, name);
    if (node.metric_id && !names.has(node.metric_id)) names.set(node.metric_id, name);
  }
  for (const metric of metrics) {
    if (!names.has(metric.code) && metric.label.trim()) names.set(metric.code, metric.label.trim());
  }
  return names;
}

export function resolveMetricDisplayName(
  names: ReadonlyMap<string, string>,
  selection: string,
  fallback: string,
): string {
  const exact = names.get(selection);
  if (exact) return exact;
  const base = selection.split("!", 1)[0] ?? selection;
  return names.get(base) ?? fallback;
}

export function canonicalizeMetricsCsv(
  csv: string,
  columns: ReadonlyArray<{ code: string; label: string }>,
  names: ReadonlyMap<string, string>,
): string {
  const newline = csv.indexOf("\n");
  if (newline < 0) return csv;
  let header = csv.slice(0, newline);
  for (const column of columns) {
    const canonical = resolveMetricDisplayName(names, column.code, column.label);
    if (canonical === column.label) continue;
    header = header.replaceAll(`"${column.label.replaceAll('"', '""')}"`, `"${canonical}"`);
    header = header.replaceAll(column.label, canonical);
  }
  return `${header}${csv.slice(newline)}`;
}
