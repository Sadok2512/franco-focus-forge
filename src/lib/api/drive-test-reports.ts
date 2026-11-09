import { z } from "zod";
import { kpiFetch } from "./project-kpi";

const nullableNumber = z.number().nullable();

export const DriveTestFiltersSchema = z.object({
  project_id: z.string(),
  captures: z.array(z.string()),
  operators: z.array(z.string()),
  rats: z.array(z.string()),
  bands: z.array(z.string()),
  services: z.array(z.string()),
  cells: z.array(z.string()),
  sites: z.array(z.string()),
  time_min: z.string().nullable(),
  time_max: z.string().nullable(),
});

export const ReportMetricSchema = z.object({
  code: z.string(), label: z.string(), unit: z.string(),
  status: z.string(), reason: z.string().nullable(), n: z.number().int(),
  avg: nullableNumber, p10: nullableNumber, p50: nullableNumber,
  p90: nullableNumber, max: nullableNumber,
});

export const ReportPointSchema = z.object({
  capture_id: z.string().nullable(), seq: z.number().int().nullable(), ts: z.string().nullable(),
  operator: z.string().nullable(), rat: z.string().nullable(), band: z.string().nullable(),
  service: z.string().nullable(), cell: z.string().nullable(), site: z.string().nullable(),
  dl: nullableNumber, thrpt_ul: nullableNumber, rsrp: nullableNumber,
  rsrq: nullableNumber, sinr: nullableNumber, cqi: nullableNumber,
  mimo_rank: nullableNumber, population: z.number().int(),
});

export const ReportTaskSchema = z.object({
  id: z.string(), capture_id: z.string(), seq_start: z.number().int(), seq_end: z.number().int(),
  task_type: z.string().nullable(), operator: z.string().nullable(), tech: z.string().nullable(),
  band: z.string().nullable(), duration_s: nullableNumber, status: z.string(),
  reason: z.string().nullable(), bytes_dcomp: nullableNumber,
});

export const ReportTaskSummarySchema = z.object({
  attempts: z.number().int(), successes: z.number().int(), failures: z.number().int(),
  avg_duration_s: nullableNumber, volume_bytes: nullableNumber,
});

export const ReportSplitGroupSchema = z.object({
  key: z.string(), label: z.string(),
  population: z.object({ samples: z.number().int(), returned: z.number().int() }),
  metrics: z.array(ReportMetricSchema),
  task_summary: ReportTaskSummarySchema,
  sources: z.array(z.string()),
});

export const DriveTestReportDataSchema = z.object({
  project_id: z.string(), filters: z.record(z.unknown()), methodology: z.string(),
  split_by: z.enum(["none", "operator", "stream"]),
  groups: z.array(ReportSplitGroupSchema),
  population: z.object({ samples: z.number().int(), returned: z.number().int(), sampling: z.string() }),
  metrics: z.array(ReportMetricSchema),
  unsupported: z.array(z.object({ code: z.string(), status: z.string(), value: z.null(), n: z.number().int(), reason: z.string() })),
  points: z.array(ReportPointSchema), tasks: z.array(ReportTaskSchema),
  task_summary: ReportTaskSummarySchema,
  services: z.array(z.object({
    service: z.string(), attempts: z.number().int(), successes: z.number().int(),
    failures: z.number().int(), volume_bytes: z.number().int(),
  })),
  failures: z.array(ReportTaskSchema), sources: z.array(z.string()),
});

export type DriveTestReportData = z.infer<typeof DriveTestReportDataSchema>;
export type ReportPoint = z.infer<typeof ReportPointSchema>;
export type ReportMetric = z.infer<typeof ReportMetricSchema>;
export type ReportSplitGroup = z.infer<typeof ReportSplitGroupSchema>;
export type ReportSplit = "none" | "operator" | "stream";

export type DriveTestReportFilters = {
  capture_id: string[]; operator: string[]; rat: string[]; band: string[];
  service: string[]; cell: string[]; site: string[];
  split_by: ReportSplit;
  time_start?: string; time_end?: string;
};

function query(filters: DriveTestReportFilters) {
  const params = new URLSearchParams();
  for (const key of ["capture_id", "operator", "rat", "band", "service", "cell", "site"] as const)
    for (const value of filters[key]) params.append(key, value);
  if (filters.time_start) params.set("time_start", filters.time_start);
  if (filters.time_end) params.set("time_end", filters.time_end);
  params.set("split_by", filters.split_by);
  return params.toString();
}

export function getDriveTestReportFilters(projectId: string, signal?: AbortSignal) {
  return kpiFetch(
    `/projects/${encodeURIComponent(projectId)}/drive-test-reports/filters`,
    DriveTestFiltersSchema,
    signal,
  );
}

export function getDriveTestReportData(projectId: string, filters: DriveTestReportFilters, signal?: AbortSignal) {
  const qs = query(filters);
  return kpiFetch(
    `/projects/${encodeURIComponent(projectId)}/drive-test-reports/data${qs ? `?${qs}` : ""}`,
    DriveTestReportDataSchema,
    signal,
  );
}
