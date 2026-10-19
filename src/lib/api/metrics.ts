import { z } from "zod";
import { kpiFetch } from "./project-kpi";
import { taskQuery } from "./task-analytics";
import type { KpiQueryFilters } from "./project-kpi-schemas";
import { MetricSchema, MetricSeriesSchema, EventsSchema } from "./metrics-schemas";
export type { ChronogramData, ChronogramEvents } from "./metrics-schemas";
export const getMetrics = (p: string, signal?: AbortSignal) =>
  kpiFetch(`/projects/${encodeURIComponent(p)}/metrics`, MetricSchema.array(), signal);
export const getMetricCaptures = (p: string, f: KpiQueryFilters, signal?: AbortSignal) =>
  kpiFetch(
    `/projects/${encodeURIComponent(p)}/metrics/captures${taskQuery(f)}`,
    z.array(z.object({ capture_id: z.string(), label: z.string() })),
    signal,
  );
export const getMetricSeries = (
  p: string,
  capture: string,
  codes: string[],
  signal?: AbortSignal,
  range?: { from_seq: number; to_seq: number },
) =>
  kpiFetch(
    `/projects/${encodeURIComponent(p)}/metrics/series?${new URLSearchParams({ capture_id: capture, codes: codes.join(","), ...(range ? { from_seq: String(range.from_seq), to_seq: String(range.to_seq) } : {}) })}`,
    MetricSeriesSchema,
    signal,
  );
export const getCaptureEvents = (p: string, capture: string, signal?: AbortSignal) =>
  kpiFetch(
    `/projects/${encodeURIComponent(p)}/captures/${encodeURIComponent(capture)}/events?types=task,ho,rlf,rrc`,
    EventsSchema,
    signal,
  );
