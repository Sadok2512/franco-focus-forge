// Assistant IA contracts (POST /projects/{id}/assistant + mock-only history endpoints).
// History endpoints are MOCK-ONLY until backend contracts are agreed.
import { z } from "zod";
import { FilterContextSchema, MeasurementPointSchema } from "./schemas";

export const EvidenceKindSchema = z.enum(["OBSERVED", "CALCULATED", "INTERPRETED", "UNAVAILABLE"]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const AssistantFiltersSchema = FilterContextSchema.omit({ project: true, metric: true });
export type AssistantFilters = z.infer<typeof AssistantFiltersSchema>;

export const AssistantRequestSchema = z.object({
  project_id: z.string(),
  conversation_id: z.string(),
  question: z.string().min(1),
  filters: AssistantFiltersSchema,
});
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;

const Cell = z.union([z.string(), z.number(), z.null()]);

const ClaimSchema = z.object({ text: z.string(), kind: EvidenceKindSchema, source_id: z.string().optional() });

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), heading: z.string(), claims: z.array(ClaimSchema) }),
  z.object({
    type: z.literal("summary"),
    heading: z.string(),
    items: z.array(
      z.object({
        label: z.string(),
        value: z.number().nullable(),
        unit: z.string(),
        kind: EvidenceKindSchema,
        n: z.number().int().nonnegative(),
        source_id: z.string(),
      }),
    ),
  }),
  z.object({
    type: z.literal("table"),
    heading: z.string(),
    columns: z.array(z.object({ key: z.string(), label: z.string(), unit: z.string().optional(), numeric: z.boolean().optional() })),
    rows: z.array(z.record(z.string(), Cell)),
    source_id: z.string(),
    formula: z.string().optional(),
  }),
  z.object({
    type: z.literal("chart"),
    chart: z.enum(["bar", "line", "boxplot"]),
    heading: z.string(),
    x_label: z.string(),
    y_label: z.string(),
    unit: z.string(),
    categories: z.array(z.string()),
    /** bar/line: one number|null per category. boxplot: [P10,P25,P50,P75,P90] per category. */
    series: z.array(z.object({ name: z.string(), data: z.array(z.union([z.number(), z.null(), z.array(z.number())])) })),
    sample_count: z.number().int().nonnegative(),
    source_id: z.string(),
  }),
  z.object({
    type: z.literal("map"),
    heading: z.string(),
    metric: z.enum(["dl", "rsrp", "sinr", "latency"]),
    points: z.array(MeasurementPointSchema),
    center: z.tuple([z.number(), z.number()]),
    source_id: z.string(),
  }),
]);
export type Block = z.infer<typeof BlockSchema>;

export const EvidenceSchema = z.object({
  source_id: z.string(),
  source_type: z.enum(["measurement_points", "rrc_events", "rrc_dictionary"]),
  label: z.string(),
  sample_count: z.number().int().nonnegative(),
  aggregation: z.string(),
  period: z.object({ start: z.string(), end: z.string() }),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const StepSchema = z.object({ id: z.string(), label: z.string(), duration_ms: z.number().int().nonnegative() });
export type ExecStep = z.infer<typeof StepSchema>;

export const AssistantResponseSchema = z.object({
  conversation_id: z.string(),
  message_id: z.string(),
  status: z.enum(["completed", "failed", "cancelled"]),
  project_id: z.string(),
  scenario: z.string(),
  effective_filters: AssistantFiltersSchema,
  blocks: z.array(BlockSchema),
  evidence: z.array(EvidenceSchema),
  follow_ups: z.array(z.string()),
  execution_steps: z.array(StepSchema),
  warnings: z.array(z.string()),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  demo: z.literal(true),
});
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;

export const MessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), id: z.string(), at: z.string(), text: z.string() }),
  z.object({ role: z.literal("assistant"), id: z.string(), at: z.string(), response: AssistantResponseSchema }),
]);
export type ChatMessage = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  messages: z.array(MessageSchema),
});
export type Conversation = z.infer<typeof ConversationSchema>;
