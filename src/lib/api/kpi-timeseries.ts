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
  // 0.60.0 — Contexte joint depuis stg_event_raw / nmf_file sur
  // (project_id, capture_id, seq). Les trois champs restent optionnels
  // car la jointure est LEFT : une séquence sans ligne raw ou sans
  // GPS reste présente mais avec `null`. Le front affiche `—`.
  longitude: z.number().nullable().optional(),
  latitude: z.number().nullable().optional(),
  nmf_file: z.string().nullable().optional(),
  // 0.60.1 — Horodatage absolu : event_ts est l'heure-du-jour depuis
  // stg_event_raw ("HH:MM:SS.ms") et nmf_file_start est la date+heure
  // de début de fichier ("DD.MM.YYYY HH:MM:SS.ms"). Le front compose
  // l'horodatage absolu de l'observation : DATE(nmf_file_start) +
  // event_ts.
  event_ts: z.string().nullable().optional(),
  nmf_file_start: z.string().nullable().optional(),
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

/** 0.60.2 — Captures du projet qui ont au moins une observation du
 *  KPI, triées par capture_id. Utilisé pour l'auto-sélection côté
 *  Graphique (évite `/metrics/captures` qui dépend de
 *  `measurement_points`, souvent vide sur Light-only). */
export const KpiCaptureInfoSchema = z.object({
  capture_id: z.string(),
  decode_level: z.string().nullable().optional(),
  n_observations: z.number().int(),
});
export type KpiCaptureInfo = z.infer<typeof KpiCaptureInfoSchema>;

export const getKpiCaptures = (
  projectId: string,
  code: string,
  signal?: AbortSignal,
): Promise<KpiCaptureInfo[]> =>
  kpiFetch(
    `/projects/${encodeURIComponent(projectId)}/kpi/${encodeURIComponent(code)}/captures`,
    z.array(KpiCaptureInfoSchema),
    signal,
  );
