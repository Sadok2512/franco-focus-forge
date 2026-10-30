import { z } from "zod";
import { kpiFetch } from "./project-kpi";
import { taskQuery } from "./task-analytics";
import type { KpiQueryFilters } from "./project-kpi-schemas";
import {
  MetricSchema,
  MetricCatalogResponseSchema,
  MetricAnalysisSchema,
  MetricMapResponseSchema,
  MetricSeriesSchema,
  EventsSchema,
  MetricAggregateSchema,
  type MetricAggregate,
} from "./metrics-schemas";
export type { ChronogramData, ChronogramEvents } from "./metrics-schemas";
export const getMetrics = (p: string, signal?: AbortSignal) =>
  kpiFetch(`/projects/${encodeURIComponent(p)}/metrics`, MetricCatalogResponseSchema, signal);
/** 0.64.0 (F1) — agrégats d'une métrique NMF par groupe. */
export const getMetricAggregate = (
  p: string,
  code: string,
  groupBy: "none" | "operator" | "band" | "operator_band",
  filters: KpiQueryFilters = {},
  signal?: AbortSignal,
): Promise<MetricAggregate> =>
  kpiFetch(
    `/projects/${encodeURIComponent(p)}/metrics/${encodeURIComponent(code)}/aggregate?group_by=${groupBy}&${new URLSearchParams(taskQuery(filters))}`,
    MetricAggregateSchema,
    signal,
  );
export const getMetricCaptures = (p: string, f: KpiQueryFilters, signal?: AbortSignal) =>
  kpiFetch(
    `/projects/${encodeURIComponent(p)}/metrics/captures${taskQuery(f)}`,
    z.array(
      z.object({
        capture_id: z.string(),
        label: z.string(),
        // 1.92.0 — kind back 0.76.1 : 'ue'|'scanner'|null.
        kind: z.enum(["ue", "scanner"]).nullable().optional(),
      }),
    ),
    signal,
  );

/** Build a metric request query with a single authoritative capture id.
 * `taskQuery` also carries the workspace capture filter; using `set` here
 * prevents the same key being emitted twice when an endpoint requires it as
 * an explicit argument. */
export function metricRequestQuery(
  capture: string,
  filters: KpiQueryFilters,
  values: Record<string, string>,
) {
  const query = new URLSearchParams(taskQuery(filters));
  query.set("capture_id", capture);
  for (const [key, value] of Object.entries(values)) query.set(key, value);
  return query;
}

export const getMetricSeries = (
  p: string,
  capture: string,
  codes: string[],
  signal?: AbortSignal,
  range?: { from_seq: number; to_seq: number },
  filters: KpiQueryFilters = {},
) =>
  kpiFetch(
    `/projects/${encodeURIComponent(p)}/metrics/series?${metricRequestQuery(capture, filters, { codes: codes.join(","), max_points: "2000", ...(range ? { from_seq: String(range.from_seq), to_seq: String(range.to_seq) } : {}) })}`,
    MetricSeriesSchema,
    signal,
  );
export const getCaptureEvents = (
  p: string,
  capture: string,
  signal?: AbortSignal,
  filters: KpiQueryFilters = {},
) =>
  kpiFetch(
    `/projects/${encodeURIComponent(p)}/captures/${encodeURIComponent(capture)}/events?types=task,ho,rlf,rrc&${new URLSearchParams(taskQuery(filters))}`,
    EventsSchema,
    signal,
  );

export const getMetricAnalysis = (
  p: string,
  capture: string,
  codes: string[],
  filters: KpiQueryFilters,
  options: {
    group_by: string;
    include_map: boolean;
    x?: string;
    page?: number;
    page_size?: number;
    table_only?: boolean;
    cell_pci?: number;
    cell_arfcn?: number;
  },
  signal?: AbortSignal,
) =>
  kpiFetch(
    `/projects/${encodeURIComponent(p)}/metrics/table?${metricRequestQuery(capture, filters, { codes: codes.join(","), group_by: options.group_by, include_map: String(options.include_map), table_only: String(options.table_only ?? false), page: String(options.page ?? 1), page_size: String(options.page_size ?? 25), ...(options.x ? { x: options.x } : {}), ...(options.cell_pci != null ? { cell_pci: String(options.cell_pci) } : {}), ...(options.cell_arfcn != null ? { cell_arfcn: String(options.cell_arfcn) } : {}) })}`,
    MetricAnalysisSchema,
    signal,
  );

/** Load every geolocated point without running table, histogram or CSV work. */
export const getMetricMap = (
  p: string,
  capture: string,
  codes: string[],
  filters: KpiQueryFilters,
  signal?: AbortSignal,
) =>
  kpiFetch(
    `/projects/${encodeURIComponent(p)}/metrics/map?${metricRequestQuery(capture, filters, { codes: codes.join(",") })}`,
    MetricMapResponseSchema,
    signal,
  );
