import { z } from "zod";
export const MetricSchema = z.object({
  code: z.string(),
  label: z.string(),
  unit: z.string(),
  event_code: z.string(),
  decoder_version: z.string(),
  proof_ref: z.string(),
  source_table: z.string(),
  source_column: z.string(),
  tech: z.enum(["LTE", "NR", "BOTH"]),
  kind: z.enum(["numeric", "categorical"]),
  n_in_project: z.number().int(),
});
export const MetricSeriesSchema = z.object({
  decoder_version: z.string(),
  schema_version: z.string(),
  decode_level: z.enum(["light", "deep"]),
  aggregation: z.string(),
  project_id: z.string(),
  capture_id: z.string(),
  result_id: z.string(),
  origin_seq: z.number(),
  origin_ts: z.string(),
  duration_s: z.number(),
  time_policy: z.string(),
  csv: z.string(),
  series: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      unit: z.string(),
      kind: z.enum(["numeric", "categorical"]),
      n_total: z.number(),
      n_returned: z.number(),
      sampling: z.object({
        method: z.string(),
        factor: z.number(),
        seq_bucket_width: z.number().nullable(),
      }),
      states: z.array(z.string()),
      segments: z.array(z.object({ start_s: z.number(), end_s: z.number(), value: z.string() })),
      points: z.array(
        z.object({
          seq: z.number(),
          t_rel_s: z.number(),
          value: z.union([z.number(), z.string()]),
          tooltip: z.string(),
        }),
      ),
    }),
  ),
});
export const EventsSchema = z.object({
  project_id: z.string(),
  capture_id: z.string(),
  result_id: z.string(),
  markers: z.array(
    z.object({
      seq: z.number(),
      t_rel_s: z.number(),
      type: z.enum(["task", "ho", "rlf", "rrc"]),
      label: z.string(),
    }),
  ),
});
export type ChronogramData = z.infer<typeof MetricSeriesSchema>;
export type ChronogramEvents = z.infer<typeof EventsSchema>;
