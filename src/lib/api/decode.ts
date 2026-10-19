import { z } from "zod";
import { apiFetch } from "./http";
import { kpiFetch } from "./project-kpi";
export const DecodeJobSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  level: z.enum(["light", "deep"]),
  capture_ids: z.array(z.string()),
  decoder_version: z.string(),
  status: z.string(),
  done: z.number(),
  total: z.number(),
  captures_remaining: z.number(),
  estimated_remaining_minutes: z.number(),
  progress_percent: z.number(),
  elapsed_s: z.number().nullable(),
  error: z.string().nullable(),
});
export const DecodeStatusSchema = z.object({
  project_id: z.string(),
  decoder_version: z.string(),
  light: z.number(),
  deep: z.number(),
  undecoded: z.number(),
  captures_remaining: z.number(),
  estimated_remaining_minutes: z.number(),
  estimated_minutes_per_capture: z.number(),
  estimate_basis: z.string(),
  levels: z.array(
    z.object({
      level: z.enum(["light", "deep"]),
      decoder_version: z.string(),
      captures: z.number(),
    }),
  ),
  captures: z.array(
    z.object({
      capture_id: z.string(),
      decode_level: z.enum(["light", "deep"]),
      decoder_version: z.string(),
      schema_version: z.string(),
      estimated_deep_minutes: z.number(),
    }),
  ),
  jobs: DecodeJobSchema.array(),
});
export const UnknownMetricSchema = z.object({
  event_code: z.string(),
  code: z.string(),
  n_buckets: z.number(),
  selectable: z.literal(false),
  reason: z.string(),
});
export const getDecodeStatus = (project: string, signal?: AbortSignal) =>
  kpiFetch(`/projects/${encodeURIComponent(project)}/decode/status`, DecodeStatusSchema, signal);
export const startDeepDecode = (project: string, capture?: string) =>
  apiFetch(
    `/projects/${encodeURIComponent(project)}/decode?${new URLSearchParams({ level: "deep", ...(capture ? { capture_id: capture } : {}) })}`,
    DecodeJobSchema,
    { method: "POST" },
  );
export const getUnknownMetrics = (project: string, signal?: AbortSignal) =>
  kpiFetch(
    `/projects/${encodeURIComponent(project)}/metrics/unknown`,
    UnknownMetricSchema.array(),
    signal,
  );
