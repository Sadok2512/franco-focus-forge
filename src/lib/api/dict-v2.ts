// bc4-front — Client API Dict v2 (back ≥ 0.45.1).
// Un seul module pour les 3 endpoints : tree, distribution, param sheet.
// Toutes les réponses sont validées par Zod (passthrough champs optionnels).
// Jamais de return null silencieux : les erreurs du back remontent telles
// quelles via `apiFetch` → `toUserMessage` côté UI.
import { z } from "zod";
import { apiFetch, buildQuery } from "./http";

// --- Enums
const OriginSchema = z.enum(["network_config", "ue_capability", "ue_report"]);
const ViewSchema = z.enum(["catalog", "raw"]);
const GroupBySchema = z.enum(["operator", "band", "operator_band"]);
const VerdictSchema = z.enum(["IDENTIQUE", "DIFFERENT", "NON_COMPARE"]);

// --- Tree
const DictLeafSchema = z
  .object({
    param_key: z.string(),
    display_name: z.string(),
    unit: z.string().nullable().optional(),
    choice_of: z.string().nullable().optional(),
    discriminators: z.record(z.unknown()).nullable().optional(),
    origin: OriginSchema.nullable().optional(),
    is_identifier: z.boolean().optional(),
    n: z.number(),
    sample_paths: z.array(z.string()).optional(),
  })
  .passthrough();
export type DictLeaf = z.infer<typeof DictLeafSchema>;

const DictGroupSchema = z
  .object({
    name: z.string(),
    kpis: z.array(DictLeafSchema),
  })
  .passthrough();
export type DictGroup = z.infer<typeof DictGroupSchema>;

const DictMessageBucketSchema = z
  .object({ message: z.string(), groups: z.array(DictGroupSchema) })
  .passthrough();
export type DictMessageBucket = z.infer<typeof DictMessageBucketSchema>;

const DictOriginBucketSchema = z
  .object({ origin: OriginSchema, messages: z.array(DictMessageBucketSchema) })
  .passthrough();
export type DictOriginBucket = z.infer<typeof DictOriginBucketSchema>;

const DictTechnoBucketSchema = z
  .object({ techno: z.string(), origins: z.array(DictOriginBucketSchema) })
  .passthrough();
export type DictTechnoBucket = z.infer<typeof DictTechnoBucketSchema>;

const DictTreeResponseSchema = z
  .object({
    project_id: z.string(),
    view: ViewSchema,
    total_rows: z.number(),
    distinct_param_keys: z.number(),
    tree: z.array(DictTechnoBucketSchema),
  })
  .passthrough();
export type DictTreeResponse = z.infer<typeof DictTreeResponseSchema>;

// --- Distribution
const DistributionValueGroupSchema = z
  .object({
    operator: z.string().nullable().optional(),
    band: z.string().nullable().optional(),
    n: z.number(),
    operator_color: z.string().nullable().optional(),
    band_color: z.string().nullable().optional(),
  })
  .passthrough();
export type DistributionValueGroup = z.infer<typeof DistributionValueGroupSchema>;

const DistributionValueSchema = z
  .object({
    value: z.string(),
    value_display: z.string(),
    groups: z.array(DistributionValueGroupSchema),
  })
  .passthrough();
export type DistributionValue = z.infer<typeof DistributionValueSchema>;

const DistributionBlockSchema = z
  .object({
    param_key: z.string(),
    display_name: z.string(),
    unit: z.string().nullable().optional(),
    choice_of: z.string().nullable().optional(),
    discriminators: z.record(z.unknown()).nullable().optional(),
    origin: OriginSchema,
    n_total: z.number(),
    distinct_values: z.number(),
    values: z.array(DistributionValueSchema),
    comparability: z.string(),
    verdict: VerdictSchema,
    result_id: z.string(),
  })
  .passthrough();
export type DistributionBlock = z.infer<typeof DistributionBlockSchema>;

const DictDistributionResponseSchema = z
  .object({
    project_id: z.string(),
    group_by: GroupBySchema,
    blocks: z.array(DistributionBlockSchema),
  })
  .passthrough();
export type DictDistributionResponse = z.infer<typeof DictDistributionResponseSchema>;
export type GroupByMode = z.infer<typeof GroupBySchema>;

// --- Param sheet
const DictParamSheetSchema = z
  .object({
    project_id: z.string(),
    param_key: z.string(),
    display_name: z.string(),
    unit: z.string().nullable().optional(),
    choice_of: z.string().nullable().optional(),
    discriminators_examples: z.array(z.record(z.unknown())),
    origin: OriginSchema,
    source: z.string(),
    carrying_messages: z.array(z.record(z.unknown())),
    n_total: z.number(),
    sample_paths: z.array(z.string()),
    kpi_hint: z.string().nullable().optional(),
  })
  .passthrough();
export type DictParamSheet = z.infer<typeof DictParamSheetSchema>;

// --- Fetchers (toujours via apiFetch — Zod obligatoire)

export async function getDictTree(
  projectId: string,
  view: "catalog" | "raw",
  signal?: AbortSignal,
): Promise<DictTreeResponse> {
  const q = buildQuery({ view });
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/dict/v2/tree${q}`,
    DictTreeResponseSchema,
    { signal },
  );
}

export async function getDictDistribution(
  projectId: string,
  keys: string[],
  groupBy: GroupByMode,
  signal?: AbortSignal,
): Promise<DictDistributionResponse> {
  // keys passés en CSV via buildQuery (il joint sur `,`).
  const q = buildQuery({ keys, group_by: groupBy });
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/dict/v2/distribution${q}`,
    DictDistributionResponseSchema,
    { signal },
  );
}

export async function getDictParam(
  projectId: string,
  paramKey: string,
  signal?: AbortSignal,
): Promise<DictParamSheet> {
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/dict/v2/param/${encodeURIComponent(paramKey)}`,
    DictParamSheetSchema,
    { signal },
  );
}
