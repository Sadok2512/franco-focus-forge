import { z } from "zod";
import { apiFetch } from "./http";
const envelope = { project_id: z.string(), capture_id: z.string(), result_id: z.string() };
const line = z.object({
  capture_id: z.string(),
  seq: z.number(),
  t_rel_s: z.number().nullable(),
  protocol: z.string(),
  technology: z.string().nullable(),
  direction: z.string().nullable(),
  message_name: z.string(),
  ecgi: z.string().nullable(),
  pci: z.number().nullable(),
  size_bytes: z.number().nullable(),
  procedure_id: z.string().nullable(),
  procedure_ids: z.array(z.string()),
  has_tree: z.boolean(),
  source: z.string(),
});
const procedure = z.object({
  id: z.string(),
  type: z.string(),
  technology: z.string().nullable(),
  seq_start: z.number(),
  seq_end: z.number().nullable(),
  duration_ms: z.number().nullable(),
  outcome: z.string(),
  cause: z.string().nullable(),
  boundary_seqs: z.array(z.number()),
});
const point = z.object({
  seq: z.number(),
  t_rel_s: z.number().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  protocol: z.string(),
  gps_seq: z.number().nullable(),
  seq_gap: z.number().nullable(),
});
export const signalingSchemas = {
  captures: z.object({
    project_id: z.string(),
    captures: z.array(
      z.object({ capture_id: z.string(), label: z.string(), env: z.string().nullable() }),
    ),
  }),
  rows: z.object({
    ...envelope,
    rows: z.array(line),
    total: z.number(),
    page: z.number(),
    size: z.number(),
    pages: z.number(),
    protocol_counts: z.record(z.number()),
    procedures: z.array(procedure),
    selected_page: z.number().nullable(),
  }),
  timeline: z.object({
    ...envelope,
    buckets: z.array(z.object({ t_rel_s: z.number(), counts: z.record(z.number()) })),
    bucket_s: z.number(),
    total: z.number(),
    missing_time: z.number(),
  }),
  points: z.object({
    ...envelope,
    points: z.array(point),
    positioned_count: z.number(),
    markers: z.array(point.extend({ counts: z.record(z.number()), seqs: z.array(z.number()) })),
    indoor: z.boolean(),
    floorplan_id: z.string().nullable(),
    reason: z.string().nullable(),
  }),
  context: z.object({
    ...envelope,
    seq: z.number(),
    radio: z.record(
      z.object({
        value: z.number().nullable(),
        unit: z.string(),
        source: z.string(),
        seq: z.number().nullable(),
        seq_gap: z.number().nullable(),
        time_gap_s: z.number().nullable(),
        temporal_relation: z.enum(["unavailable", "same_timestamp", "previous_timestamp"]),
        reason: z.string().nullable().optional(),
      }),
    ),
    ecgi: z.string().nullable(),
    ecgi_seq_gap: z.number().nullable(),
    enb_gnb_id: z.string().nullable(),
    sector: z.string().nullable(),
    identity_reason: z.string(),
  }),
  details: z.object({
    ...envelope,
    seq: z.number(),
    tree: z.record(z.unknown()),
    parameters: z.array(
      z.object({ path: z.string(), value: z.unknown(), param_key: z.string().nullable() }),
    ),
    text: z.string(),
    hex: z.string().nullable(),
    hex_reason: z.string().nullable(),
    tree_source: z.string(),
    tree_route_gap: z.string(),
  }),
  export: z.object({ csv: z.string(), filename: z.string(), result_id: z.string() }),
};
export type SignalingRows = z.infer<typeof signalingSchemas.rows>;
export type SignalingTimeline = z.infer<typeof signalingSchemas.timeline>;
export type SignalingPoints = z.infer<typeof signalingSchemas.points>;
export type SignalingLine = z.infer<typeof line>;
export function getSignaling<K extends keyof typeof signalingSchemas>(
  projectId: string,
  kind: K,
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<z.infer<(typeof signalingSchemas)[K]>> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) query.set(k, String(v));
  const path = `/projects/${encodeURIComponent(projectId)}/signaling${kind === "rows" ? "" : "/" + kind}?${query}`;
  return apiFetch(path, signalingSchemas[kind] as z.ZodTypeAny, { signal }) as Promise<
    z.infer<(typeof signalingSchemas)[K]>
  >;
}
