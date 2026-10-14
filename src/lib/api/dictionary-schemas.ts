import { z } from "zod";

// Exact contract shapes from the C1 spec (§6). conversion_rule is an object or null;
// `formula` is the human-readable rule, scale/offset make it machine-checkable.
export const ConversionRuleSchema = z.object({
  formula: z.string(), scale: z.number(), offset: z.number(), unit: z.string(), decimals: z.number().int(), ref: z.string(),
});
export type ConversionRule = z.infer<typeof ConversionRuleSchema>;

const GeoNode: z.ZodType<GeoNodeT> = z.lazy(() => z.object({ id: z.string(), label: z.string(), level: z.enum(["plaque", "dr", "departement", "site"]), children: z.array(GeoNode) }));
export type GeoNodeT = { id: string; label: string; level: "plaque" | "dr" | "departement" | "site"; children: GeoNodeT[] };

export const DictProjectSchema = z.object({
  id: z.string(),
  dimensions: z.object({
    operators: z.array(z.string()), services: z.array(z.string()), technos: z.array(z.string()),
    bands: z.array(z.string()), geo_tree: z.array(GeoNode), periods: z.array(z.string()),
  }),
});
export type DictProject = z.infer<typeof DictProjectSchema>;

export const TreeSchema = z.object({
  branches: z.array(z.object({
    techno: z.enum(["LTE", "NR"]),
    channels: z.array(z.object({ name: z.string(), messages: z.array(z.object({ msg_id: z.string(), name: z.string(), count: z.number().int().nonnegative() })) })),
  })),
}).refine((t) => t.branches.some((b) => b.techno === "LTE") && t.branches.some((b) => b.techno === "NR"), "LTE et NR doivent toujours être présents");
export type DictTree = z.infer<typeof TreeSchema>;

const DominantSchema = z.object({ value: z.union([z.string(), z.number()]).nullable(), conversion: z.string().nullable(), share: z.number().min(0).max(1).nullable() });

export const ParamListSchema = z.object({
  params: z.array(z.object({
    param_id: z.string(), leaf: z.string(), path: z.string(),
    n: z.number().int().nonnegative(), distinct: z.number().int().nonnegative(), dominant: DominantSchema,
  })),
});
export type ParamList = z.infer<typeof ParamListSchema>;
export type ParamSummary = ParamList["params"][number];

export const ParamDetailSchema = z.object({
  fiche: z.object({
    techno: z.enum(["LTE", "NR"]), message: z.string(), path: z.string(), leaf: z.string(), type: z.string(),
    dominant: DominantSchema, conversion_rule: ConversionRuleSchema.nullable(),
  }),
  histogram: z.array(z.object({ label: z.string(), value_num: z.number().nullable(), count: z.number().int().nonnegative() })),
  matrix: z.object({
    bins: z.array(z.string()),
    rows: z.array(z.object({
      key: z.string(), total: z.number().int().nonnegative(),
      cells: z.array(z.object({ bin_index: z.number().int().nonnegative(), pct: z.number().min(0).max(100), n: z.number().int().nonnegative() })),
    })),
  }),
}).superRefine((d, ctx) => {
  for (const r of d.matrix.rows) {
    let sum = 0;
    for (const c of r.cells) {
      if (c.bin_index >= d.matrix.bins.length) ctx.addIssue({ code: "custom", message: `bin_index ${c.bin_index} hors bornes (${r.key})` });
      sum += c.n;
    }
    if (sum !== r.total) ctx.addIssue({ code: "custom", message: `Total incohérent pour ${r.key}: ${sum} ≠ ${r.total}` });
  }
});
export type ParamDetail = z.infer<typeof ParamDetailSchema>;

export const ParamMapSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.object({
    type: z.literal("Feature").optional(),
    geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
    properties: z.object({ value: z.union([z.number(), z.string()]), display: z.string() }),
  })),
  legend: z.object({
    kind: z.enum(["numeric", "categorical"]),
    stops: z.array(z.object({ value: z.number(), label: z.string() })).optional(),
    classes: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  }),
});
export type ParamMap = z.infer<typeof ParamMapSchema>;

export type GroupBy = "operator" | "band" | "operator,band";
