import { z } from "zod";
export const MetricSchema = z.object({
  event: z.string(),
  category_label: z.string(),
  root_notices: z.array(z.object({ label: z.string(), reason: z.string() })),
  cell_scoped: z.boolean(),
  cells: z.array(z.number().int()),
  cell_options: z.array(
    z.object({
      cell: z.string(),
      label: z.string(),
      n_in_project: z.number(),
      available: z.boolean(),
      reason: z.string().nullable(),
    }),
  ),
  attributes: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      unit: z.string(),
      kind: z.enum(["numeric", "categorical"]),
      proof: z.string(),
      proof_ref: z.string(),
    }),
  ),
  proof: z.enum(["documented", "content", "none"]),
  available: z.boolean(),
  reason: z.string().nullable(),
  alias_of: z.string().nullable(),
  event_group: z.string().nullable(),
  unproven_cells: z.array(z.object({ cell: z.string(), label: z.string(), reason: z.string() })),
  code: z.string(),
  label: z.string(),
  unit: z.string(),
  event_code: z.string(),
  decoder_version: z.string(),
  proof_ref: z.string(),
  source_table: z.string(),
  source_column: z.string(),
  tech: z.enum(["LTE", "NR", "BOTH"]),
  kind: z.enum(["numeric", "categorical", "event"]),
  n_in_project: z.number().int(),
  // 0.64.0 (F1 back) — champ YAML `category` du décodeur (14 catégories).
  category: z.string().nullable().optional(),
});
export const MetricCatalogNodeSchema = z.object({
  node_id: z.string(),
  parent_id: z.string().nullable(),
  order: z.number().int(),
  label: z.string(),
  note: z.string().nullable(),
  source: z.string().nullable(),
  node_type: z.enum(["category", "group", "metric", "leaf"]),
  metric_id: z.string().nullable(),
  selection: z.string().nullable(),
  event: z.string().nullable(),
  field_idx: z.number().int().nullable(),
  source_column: z.string().nullable(),
  unit: z.string(),
  cell: z.enum(["pcell", "scell1", "scell2", "scell3", "scell4", "pscell", "scell_nr"]).nullable(),
  n: z.number().int(),
  proof: z.enum(["documented", "content", "open"]),
  selectable: z.boolean(),
  reason: z.string().nullable(),
});
export const MetricCatalogResponseSchema = z.object({
  catalogue_version: z.literal("v6"),
  title: z.string(),
  header: z.string(),
  metrics: z.array(MetricSchema),
  nodes: z.array(MetricCatalogNodeSchema),
});

/** Metrics v6 catalogue envelope. The API returns presentation metadata plus
 * the selectable metric rows; consumers of getMetrics use the rows only. */
export const MetricCatalogResponseSchema = z.object({
  catalogue_version: z.string(),
  title: z.string(),
  header: z.string(),
  metrics: z.array(MetricSchema),
  nodes: z.array(
    z.object({
      node_id: z.string(),
      parent_id: z.string().nullable(),
      order: z.number().int(),
      label: z.string(),
      note: z.string().nullable(),
      source: z.string().nullable(),
      node_type: z.enum(["category", "group", "metric", "leaf"]),
      metric_id: z.string().nullable(),
      selection: z.string().nullable(),
      event: z.string().nullable(),
      field_idx: z.number().int().nullable(),
      source_column: z.string().nullable(),
      unit: z.string(),
      cell: z.string().nullable(),
      n: z.number().int(),
      proof: z.enum(["documented", "content", "open"]),
      selectable: z.boolean(),
      reason: z.string().nullable(),
    }),
  ),
});

/** 0.64.0 (F1 back) — /projects/{p}/metrics/{code}/aggregate */
export const MetricAggregateRowSchema = z.object({
  operator: z.string().nullable(),
  band: z.string().nullable(),
  n: z.number().int(),
  p10: z.number().nullable(),
  p50: z.number().nullable(),
  p90: z.number().nullable(),
});

export const MetricAggregateSchema = z.object({
  project_id: z.string(),
  metric_code: z.string(),
  group_by: z.string(),
  unit: z.string().nullable(),
  tech: z.enum(["LTE", "NR", "BOTH"]),
  kind: z.enum(["numeric", "categorical", "event"]),
  n: z.number().int(),
  p10: z.number().nullable(),
  p50: z.number().nullable(),
  p90: z.number().nullable(),
  groups: z.array(MetricAggregateRowSchema),
});
export type MetricAggregate = z.infer<typeof MetricAggregateSchema>;
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
      cell: z.string(),
      code: z.string(),
      label: z.string(),
      unit: z.string(),
      kind: z.enum(["numeric", "categorical", "event"]),
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

export type MetricInfo = z.infer<typeof MetricSchema>;
export type MetricCatalogNode = z.infer<typeof MetricCatalogNodeSchema>;
export type MetricCatalogResponse = z.infer<typeof MetricCatalogResponseSchema>;
const scalar = z.union([z.number(), z.string()]);
export const MetricAnalysisSchema = z.object({
  project_id: z.string(),
  capture_id: z.string(),
  result_id: z.string(),
  decoder_version: z.string(),
  schema_version: z.string(),
  decode_level: z.enum(["deep", "light"]),
  origin_seq: z.number(),
  origin_ts: z.string(),
  duration_s: z.number(),
  aggregation: z.string(),
  time_policy: z.string(),
  pairing: z.string(),
  columns: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      unit: z.string(),
      kind: z.enum(["numeric", "categorical", "event"]),
      cell: z.string(),
    }),
  ),
  rows: z.array(
    z.object({
      second: z.number(),
      t_rel_s: z.number(),
      seq_first: z.number(),
      seq_last: z.number(),
      time_label: z.string(),
      values: z.record(scalar.nullable()),
      counts: z.record(z.number()),
    }),
  ),
  series: MetricSeriesSchema.shape.series,
  histogram: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      operator: z.string().nullable(),
      band: z.string().nullable(),
      cell: z.string(),
      n: z.number(),
      p10: z.number().nullable(),
      p50: z.number().nullable(),
      p90: z.number().nullable(),
      distribution: z.array(z.object({ value: scalar, n: z.number() })),
      per_connected_hour: z.number().nullable(),
    }),
  ),
  scatter: z.array(
    z.object({
      code: z.string(),
      seq: z.number(),
      x_seq: z.number(),
      seq_gap: z.number(),
      cell: z.string(),
      x: scalar,
      value: scalar,
    }),
  ),
  map_points: z.array(
    z.object({
      seq: z.number(),
      lat: z.number(),
      lng: z.number(),
      code: z.string(),
      value: scalar,
      t_rel_s: z.number().nullable(),
      tooltip: z.string(),
    }),
  ),
  connected_seconds: z.number().nullable(),
  connected_reason: z.string().nullable(),
  pair_rates: z.array(
    z.object({
      type: z.string(),
      attempts: z.number(),
      completed: z.number(),
      success: z.number(),
      known_outcomes: z.number(),
      success_pct: z.number().nullable(),
    }),
  ),
  gaps: z.array(z.string()),
  csv: z.string(),
});
export type MetricAnalysis = z.infer<typeof MetricAnalysisSchema>;
