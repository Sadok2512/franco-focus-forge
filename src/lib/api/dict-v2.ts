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

const DictCatalogLeafSchema = DictLeafSchema.extend({
  message: z.string(),
  subcategory_id: z.string().nullable(),
  source_param_keys: z.array(z.string()),
  n_occurrences: z.number(),
  n_captures: z.number(),
  n_in_tech: z.number(),
});
const DictParameterNodeSchema = z
  .object({
    param_key: z.string(),
    display_name: z.string(),
    unit: z.string().nullable().optional(),
    category_id: z.string(),
    subcategory_id: z.string().nullable().optional(),
    n: z.number(),
    n_occurrences: z.number(),
    n_captures: z.number(),
    n_in_tech: z.number(),
    leaves: z.array(DictCatalogLeafSchema),
  })
  .passthrough();
const DictSubcategoryNodeSchema = z
  .object({
    id: z.string().nullable(),
    label: z.string(),
    position: z.number(),
    parameters: z.array(DictParameterNodeSchema),
  })
  .passthrough();
const DictCategoryNodeSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    position: z.number(),
    subcategories: z.array(DictSubcategoryNodeSchema),
  })
  .passthrough();
export type DictParameterNode = z.infer<typeof DictParameterNodeSchema>;
export type DictCategoryNode = z.infer<typeof DictCategoryNodeSchema>;

const DictOriginBucketSchema = z
  .object({
    origin: OriginSchema,
    messages: z.array(DictMessageBucketSchema).default([]),
    categories: z.array(DictCategoryNodeSchema).optional(),
  })
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
    available_messages: z.array(z.string()).optional(),
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
    group_totals: z.array(DistributionValueGroupSchema).optional(),
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

const DictGeographicDimensionSchema = z.object({
  key: z.enum(["dor", "plaque", "arcep_zone"]),
  label: z.string(),
  available: z.boolean(),
  reason: z.string().nullable(),
  options: z.array(z.string()),
  count: z.number().int().nonnegative(),
});
const DictFilterOptionsSchema = z.object({
  project_id: z.string(),
  geographic: z.array(DictGeographicDimensionSchema),
});
export type DictGeographicDimension = z.infer<typeof DictGeographicDimensionSchema>;
export type DictGeoFilters = Partial<Record<DictGeographicDimension["key"], string[]>>;
export function getDictFilterOptions(projectId: string, signal?: AbortSignal) {
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/dict/v2/filters`,
    DictFilterOptionsSchema,
    { signal },
  );
}

// --- Fetchers (toujours via apiFetch — Zod obligatoire)

export async function getDictTree(
  projectId: string,
  view: "catalog" | "raw",
  signal?: AbortSignal,
  message?: string,
): Promise<DictTreeResponse> {
  const q = buildQuery({ view, message: message || undefined });
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
  geographic: DictGeoFilters = {},
  technology?: "LTE" | "NR" | "LTE+NR",
): Promise<DictDistributionResponse> {
  // keys passés en CSV via buildQuery (il joint sur `,`).
  const base = buildQuery({
    keys,
    group_by: groupBy,
    technology: technology === "LTE+NR" ? undefined : technology,
  });
  const geo = new URLSearchParams();
  for (const key of ["dor", "plaque", "arcep_zone"] as const)
    for (const value of geographic[key] ?? []) geo.append(key, value);
  const q = base + (geo.size ? `&${geo}` : "");
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

export const DictMapResponseSchema = z.object({
  project_id: z.string(),
  points: z.array(
    z.object({
      occurrence_id: z.string(),
      event_id: z.string(),
      capture_id: z.string(),
      seq: z.number().int(),
      nmf_file_id: z.string().nullable(),
      param_key: z.string(),
      display_name: z.string().nullable(),
      path: z.string(),
      technology: z.string(),
      operator: z.string().nullable(),
      band: z.string().nullable(),
      value_raw: z.string().nullable(),
      value_converted: z.string().nullable(),
      unit: z.string().nullable(),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      source: z.string(),
      coordinate_source: z.literal("stg_event"),
      operator_color: z.string(),
    }),
  ),
  total_occurrences: z.number(),
  geolocated_occurrences: z.number(),
  returned_occurrences: z.number(),
  truncated: z.boolean(),
  limit: z.number(),
  reason: z.string().nullable(),
  operators: z.array(z.object({ name: z.string(), count: z.number(), color: z.string() })),
});
export type DictMapResponse = z.infer<typeof DictMapResponseSchema>;
export type DictMapPoint = DictMapResponse["points"][number];

export function getDictMap(
  projectId: string,
  keys: string[],
  technology: string,
  operators: string[],
  bands: string[],
  geographic: DictGeoFilters,
  signal?: AbortSignal,
): Promise<DictMapResponse> {
  const query = new URLSearchParams({ keys: keys.join(",") });
  if (technology !== "LTE+NR") query.set("technology", technology);
  for (const value of operators) query.append("operator", value);
  for (const value of bands) query.append("band", value);
  for (const key of ["dor", "plaque", "arcep_zone"] as const)
    for (const value of geographic[key] ?? []) query.append(key, value);
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/dict/v2/map?${query}`,
    DictMapResponseSchema,
    { signal },
  );
}
