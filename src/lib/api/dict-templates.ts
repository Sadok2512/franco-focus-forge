import { z } from "zod";
import { apiFetch } from "./http";
const reference = z.object({
  param_key: z.string(),
  path_prefix: z.string().nullable().optional(),
  technology: z.string(),
  discriminators: z.record(z.unknown()),
});
const entry = z.object({
  id: z.string(),
  label: z.string(),
  position: z.number(),
  technology: z.string(),
  discriminators: z.record(z.unknown()),
  parameters: z.array(reference),
  reason: z.string().nullable(),
  n_in_project: z.number().nullable(),
  resolved: z.boolean(),
});
export const TemplateCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  position: z.number(),
  revision: z.number(),
  n_parameters: z.number().nullable(),
  n_in_project: z.number().nullable(),
  entries: z.array(entry),
});
export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;
const templates = z.object({ project_id: z.string(), categories: z.array(TemplateCategorySchema) });
const cell = z.object({
  operator: z.string().nullable(),
  band: z.string().nullable(),
  n: z.number(),
  missing_value_n: z.number(),
  dominant_values: z.array(z.string()),
  dominant_value: z.string().nullable(),
  percentage: z.number().nullable(),
  differs_from_majority: z.boolean().nullable(),
});
const summary = z.object({
  project_id: z.string(),
  category_id: z.string(),
  group_by: z.enum(["operator", "band", "operator_band"]),
  rows: z.array(
    z.object({
      entry_id: z.string(),
      label: z.string(),
      param_key: z.string().nullable(),
      technology: z.string(),
      discriminators: z.record(z.unknown()),
      n_in_project: z.number(),
      resolved: z.boolean(),
      reason: z.string().nullable(),
      result_id: z.string(),
      cells: z.array(cell),
      distribution: z.array(
        z.object({
          value: z.string().nullable(),
          value_display: z.string().nullable(),
          groups: z.array(
            z.object({
              operator: z.string().nullable(),
              band: z.string().nullable(),
              n: z.number(),
            }),
          ),
        }),
      ),
    }),
  ),
});
export type TemplateSummary = z.infer<typeof summary>;
export function getDictTemplates(projectId: string, signal?: AbortSignal, includeCounts = true) {
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/dict/v2/templates${includeCounts ? "" : "?include_counts=false"}`,
    templates,
    {
      signal,
    },
  );
}
export function getDictTemplateSummary(
  projectId: string,
  category: string,
  groupBy: string,
  signal?: AbortSignal,
) {
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/dict/v2/templates/${encodeURIComponent(category)}/summary?group_by=${encodeURIComponent(groupBy)}`,
    summary,
    { signal },
  );
}

const editableEntry = entry.omit({ n_in_project: true, resolved: true }).strict();
export const TemplateUpdateSchema = z
  .object({ revision: z.number().int().positive(), entries: z.array(editableEntry).max(200) })
  .strict();
export function updateDictTemplate(category: string, input: unknown) {
  const body = TemplateUpdateSchema.parse(input);
  return apiFetch(
    `/settings/dict/templates/${encodeURIComponent(category)}`,
    TemplateUpdateSchema,
    { method: "PUT", body: JSON.stringify(body) },
  );
}
