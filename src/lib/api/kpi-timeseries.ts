import { z } from "zod";
import { kpiFetch } from "./project-kpi";

/** Contrat 0.59.0 — réponse de
 *  `GET /projects/{pid}/captures/{cid}/kpi/{code}/time-series`.
 *
 *  Points : `(seq, time_s, value)` — ordre canonique `(capture_id, seq)`.
 *  Jamais d'interpolation, jamais de concaténation inter-captures.
 *  `status`/`reason` sont toujours explicites : UNAVAILABLE ne bascule
 *  pas silencieusement vers un agrégat. */
export const KpiTimeSeriesPointSchema = z.object({
  seq: z.number().int(),
  time_s: z.number(),
  value: z.union([z.number(), z.string()]),
});

export const KpiTimeSeriesSamplingSchema = z.object({
  method: z.enum(["none", "seq_bucket_min_max", "state_changes"]),
  factor: z.number(),
  seq_bucket_width: z.number().nullable(),
});

export const KpiTimeSeriesEvidenceSchema = z.object({
  source_view: z.string().nullable(),
  source_table: z.string().nullable(),
  source_column: z.string().nullable(),
  metric_code_nmf: z.string().nullable(),
  n: z.number().int(),
  result_id: z.string().nullable(),
  decoder_version: z.string().nullable(),
  schema_version: z.string().nullable(),
  decode_level: z.string().nullable(),
  origin_seq: z.number().int().nullable(),
  origin_ts: z.string().nullable(),
});

export const KpiTimeSeriesSchema = z.object({
  status: z.enum(["AVAILABLE", "PENDING", "UNVALIDATED", "UNAVAILABLE", "NOT_APPLICABLE"]),
  reason: z.string().nullable(),
  metric_code: z.string(),
  metric_name: z.string().nullable(),
  capture_id: z.string(),
  x_axis: z.object({ field: z.string(), unit: z.string().nullable() }),
  y_axis: z.object({ field: z.string(), unit: z.string().nullable() }),
  n_total: z.number().int(),
  n_returned: z.number().int(),
  points: z.array(KpiTimeSeriesPointSchema),
  sampling: KpiTimeSeriesSamplingSchema.nullable(),
  evidence: KpiTimeSeriesEvidenceSchema,
  time_policy: z.string().optional(),
});

export type KpiTimeSeries = z.infer<typeof KpiTimeSeriesSchema>;
export type KpiTimeSeriesPoint = z.infer<typeof KpiTimeSeriesPointSchema>;

/** GET /projects/{pid}/captures/{cid}/kpi/{code}/time-series */
export const getKpiTimeSeries = (
  projectId: string,
  captureId: string,
  code: string,
  maxPoints: number | undefined,
  signal?: AbortSignal,
): Promise<KpiTimeSeries> => {
  const q = maxPoints != null ? `?max_points=${maxPoints}` : "";
  return kpiFetch(
    `/projects/${encodeURIComponent(projectId)}/captures/${encodeURIComponent(captureId)}/kpi/${encodeURIComponent(code)}/time-series${q}`,
    KpiTimeSeriesSchema,
    signal,
  );
};
