import { taskQuery } from "@/lib/api/task-analytics";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";

const captureFilters = (filters: KpiQueryFilters = {}) => {
  const { capture_id: _capture, ...rest } = filters;
  const query = taskQuery(rest).replace(/^\?/, "");
  return query ? query.split("&").sort().join("&") : "";
};

export const metricCapturesKey = (projectId: string, filters: KpiQueryFilters = {}) =>
  ["metric-captures", projectId, captureFilters(filters)] as const;

export const metricTableKey = (scope: readonly unknown[]) => ["metrics-v3", ...scope] as const;

export const metricMapKey = (
  projectId: string,
  captureId: string | null,
  selections: string[],
  filters: KpiQueryFilters,
) => ["metric-map", projectId, captureId, selections, filters] as const;

export const API_LEAN_STALE_MS = 300_000;
