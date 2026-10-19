import { z } from "zod";
import { kpiFetch } from "./project-kpi";
import type { KpiQueryFilters } from "./project-kpi-schemas";

export const PopulationSchema = z.object({
  tasks: z.number().int(),
  samples: z.number().int(),
  admissible: z.number().int(),
  returned: z.number().int(),
  excluded: z.number().int(),
  incomplete_tasks: z.number().int().optional(),
});
const nullableNumber = z.number().nullable();
export const TaskSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  capture_id: z.string(),
  seq_start: z.number().int(),
  seq_end: z.number().int(),
  seq_daa: nullableNumber,
  seq_dcomp: nullableNumber,
  task_type: z.string(),
  host: z.string().nullable(),
  threads: nullableNumber,
  max_duration_s: nullableNumber,
  call_duration_s: nullableNumber,
  bytes_dcomp: nullableNumber,
  duration_s: nullableNumber,
  mos_aqdl: nullableNumber,
  operator: z.string().nullable(),
  band: z.string().nullable(),
  tech: z.string().nullable(),
  status: z.string(),
  reason: z.string().nullable(),
});
export const TaskListSchema = z.object({
  result_id: z.string(),
  project_id: z.string(),
  tasks: TaskSchema.array(),
  population: PopulationSchema,
});
export const PointSchema = z.object({
  task_id: z.string().nullish(),
  capture_id: z.string().nullish(),
  seq: nullableNumber.optional(),
  mp_seq: nullableNumber.optional(),
  seq_gap: nullableNumber.optional(),
  t_rel_s: nullableNumber.optional(),
  x: nullableNumber.optional(),
  value: nullableNumber.optional(),
  p10: nullableNumber.optional(),
  p50: nullableNumber.optional(),
  p90: nullableNumber.optional(),
  n: nullableNumber.optional(),
});
export const AnalyticsSchema = z.object({
  result_id: z.string(),
  project_id: z.string(),
  code: z.string(),
  x_metric: z.string(),
  x_unit: z.string(),
  y_unit: z.string(),
  population: PopulationSchema,
  points: PointSchema.array(),
  sampling: z.record(z.unknown()),
  excluded: z
    .object({
      nr_no_profile: z.number().int().nonnegative(),
      lte_not_enriched: z.number().int().nonnegative(),
      other: z.number().int().nonnegative(),
    })
    .nullish(),
  pairing: z.string().nullish(),
});
export type Task = z.infer<typeof TaskSchema>;
export type Analytics = z.infer<typeof AnalyticsSchema>;
export type TaskPoint = z.infer<typeof PointSchema>;
// Arrays are repeated query parameters in the live OpenAPI, never comma-joined.
export function taskQuery(filters: KpiQueryFilters, taskId?: string) {
  const params = new URLSearchParams();
  for (const key of [
    "operator",
    "band",
    "rat",
    "service_type",
    "phase",
    "env",
    "dep",
    "dor",
    "dr",
    "plaque",
    "arcep",
    "commune",
    "insee",
  ] as const)
    for (const value of filters[key] ?? []) params.append(key, value);
  if (taskId) params.set("task_id", taskId);
  return params.toString() ? `?${params}` : "";
}
export function getProjectTasks(project: string, filters: KpiQueryFilters, signal?: AbortSignal) {
  return kpiFetch(
    `/projects/${encodeURIComponent(project)}/tasks${taskQuery(filters)}`,
    TaskListSchema,
    signal,
  );
}
export function getTaskSeries(
  project: string,
  code: string,
  filters: KpiQueryFilters,
  taskId?: string,
  signal?: AbortSignal,
) {
  return kpiFetch(
    `/projects/${encodeURIComponent(project)}/kpi/${encodeURIComponent(code)}/series${taskQuery(filters, taskId)}`,
    AnalyticsSchema,
    signal,
  );
}
// /results has no response model in OpenAPI; these fields were verified in the live response.
export const ResultSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  sql: z.string(),
  filters: z.record(z.unknown()),
  population: PopulationSchema,
  version: z.string(),
  created_at: z.string(),
});
export function getAnalyticsResult(id: string, signal?: AbortSignal) {
  return kpiFetch(`/results/${encodeURIComponent(id)}`, ResultSchema, signal);
}

export const AxisSchema = z.object({
  code: z.string(),
  label: z.string(),
  unit: z.string(),
  source: z.string(),
});
export function getKpiAxes(project: string, signal?: AbortSignal) {
  return kpiFetch(`/projects/${encodeURIComponent(project)}/kpi/axes`, AxisSchema.array(), signal);
}
export function getTaskPoints(
  project: string,
  code: string,
  x: string,
  filters: KpiQueryFilters,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams(taskQuery(filters).replace(/^\?/, ""));
  params.set("x", x);
  return kpiFetch(
    `/projects/${encodeURIComponent(project)}/kpi/${encodeURIComponent(code)}/points?${params}`,
    AnalyticsSchema,
    signal,
  );
}
