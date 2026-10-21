import { z } from "zod";

// Contrats Signaling View (BC4_SIGNALING_TIMELINE_LOVABLE_V1).
// Toutes les mesures manquantes sont `null` et affichées « N/D » —
// jamais remplacées par 0. Le temps est toujours exprimé en secondes
// depuis le début de la capture (jamais dérivé de `seq`).

export const SigTimePointSchema = z.object({ t: z.number(), v: z.number().nullable() });
export type SigTimePoint = z.infer<typeof SigTimePointSchema>;

export const SigConnectivitySegmentSchema = z.object({
  state: z.enum(["LTE", "EN-DC", "NR-SA"]),
  start_s: z.number(),
  end_s: z.number(),
});
export type SigConnectivitySegment = z.infer<typeof SigConnectivitySegmentSchema>;

export const SigEventSeveritySchema = z.enum(["info", "success", "warning", "error", "event"]);
export type SigEventSeverity = z.infer<typeof SigEventSeveritySchema>;

export const SigEventSchema = z.object({
  id: z.string(),
  t: z.number(),
  name: z.string(),
  tech: z.string().nullable(),
  severity: SigEventSeveritySchema,
  message_index: z.number().int().nullable(),
  ecgi: z.string().nullable(),
  pci: z.number().int().nullable(),
});
export type SigEvent = z.infer<typeof SigEventSchema>;

export const SigTaskSchema = z.object({
  id: z.string(),
  dir: z.enum(["DL", "UL"]),
  start_s: z.number(),
  end_s: z.number(),
  label: z.string(),
  throughput: z.string().nullable(),
  message_index: z.number().int().nullable(),
});
export type SigTask = z.infer<typeof SigTaskSchema>;

export const SigCallSchema = z.object({
  id: z.string(),
  kind: z.enum(["VoLTE", "VoNR"]),
  attempt_s: z.number(),
  start_s: z.number().nullable(),
  end_s: z.number().nullable(),
  state: z.enum(["connected", "released", "dropped"]),
  message_index: z.number().int().nullable(),
});
export type SigCall = z.infer<typeof SigCallSchema>;

export const SigMobilityEventSchema = z.object({
  id: z.string(),
  t: z.number(),
  name: z.string(),
  kind: z.enum(["ho", "success", "failure", "drop"]),
  message_index: z.number().int().nullable(),
});
export type SigMobilityEvent = z.infer<typeof SigMobilityEventSchema>;

export const SigSeriesSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.string(),
  points: z.array(SigTimePointSchema),
});
export type SigSeries = z.infer<typeof SigSeriesSchema>;

export const SigTrackPointSchema = z.object({
  t: z.number(),
  lat: z.number(),
  lng: z.number(),
});
export type SigTrackPoint = z.infer<typeof SigTrackPointSchema>;

export const SigCaptureMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  captured_at: z.string(),
  tech: z.string(),
  message_count: z.number().int(),
  duration_s: z.number(),
});
export type SigCaptureMeta = z.infer<typeof SigCaptureMetaSchema>;

export const SigCaptureSchema = SigCaptureMetaSchema.extend({
  connectivity: z.array(SigConnectivitySegmentSchema),
  events: z.array(SigEventSchema),
  tasks: z.array(SigTaskSchema),
  calls: z.array(SigCallSchema),
  mobility: z.array(SigMobilityEventSchema),
  measurements: z.array(SigSeriesSchema),
  track: z.array(SigTrackPointSchema),
  events_gps: z.array(
    z.object({ event_id: z.string(), t: z.number(), lat: z.number(), lng: z.number() }),
  ),
});
export type SigCapture = z.infer<typeof SigCaptureSchema>;

export const SigMessageSchema = z.object({
  index: z.number().int(),
  t: z.number(),
  dir: z.enum(["UL", "DL"]),
  layer: z.string(),
  name: z.string(),
  procedure: z.string(),
  ecgi: z.string().nullable(),
  pci: z.number().int().nullable(),
  earfcn: z.number().int().nullable(),
  rsrp: z.number().nullable(),
  rsrq: z.number().nullable(),
  sinr: z.number().nullable(),
  octets: z.number().int(),
});
export type SigMessage = z.infer<typeof SigMessageSchema>;

export type SigPayloadNode = { key: string; value?: string; children?: SigPayloadNode[] };
export const SigPayloadNodeSchema: z.ZodType<SigPayloadNode> = z.lazy(() =>
  z.object({
    key: z.string(),
    value: z.string().optional(),
    children: z.array(SigPayloadNodeSchema).optional(),
  }),
) as z.ZodType<SigPayloadNode>;

export const SigPayloadSchema = z.object({
  decoded: SigPayloadNodeSchema,
  hex: z.string(),
  params: z.array(z.object({ key: z.string(), value: z.string(), unit: z.string().nullable() })),
  call_flow: z.array(z.object({ t: z.number(), from: z.string(), to: z.string(), label: z.string() })),
  details: z.record(z.string(), z.string()),
});
export type SigPayload = z.infer<typeof SigPayloadSchema>;
