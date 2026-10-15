// Contrats B1-réf. Alignés 1:1 avec `app/schemas/reference.py` côté bc4-back.
// Un écart Zod ↔ Pydantic doit faire échouer la validation runtime,
// jamais être « lissé » par un défaut : null reste null, affiché « N/D ».
import { z } from "zod";

export const ImportReportSchema = z.object({
  rows_read: z.number().int(),
  rows_loaded: z.number().int(),
  rows_rejected: z.number().int(),
  rejected_by_reason: z.record(z.string(), z.number().int()),
  distinct_eci: z.number().int(),
  distinct_nci: z.number().int(),
  by_rat: z.record(z.string(), z.number().int()),
  bands_unmapped: z.record(z.string(), z.number().int()),
  etat_breakdown: z.record(z.string(), z.number().int()),
  // Zone ARCEP (bc4-back 0.7.1) : comptage par libellé source LITTÉRAL
  // depuis `cat_arcep_code` (11 catégories réelles, p. ex. `"01/ Top15"`).
  // Les lignes à source `""` ou `"(null)"` tombent dans la clé explicite
  // `"__null"` (NULL non-sérialisable en clé JSON). La somme des buckets
  // == `rows_loaded`.
  arcep_breakdown: z.record(z.string(), z.number().int()),
  snapshot_date: z.string().nullable(),
});
export type ImportReport = z.infer<typeof ImportReportSchema>;

export const ReferenceImportEntrySchema = z.object({
  id: z.string(),
  filename: z.string(),
  uploaded_at: z.string(),
  actor: z.string(),
  snapshot_date: z.string().nullable(),
  rows_read: z.number().int(),
  rows_loaded: z.number().int(),
  rows_rejected: z.number().int(),
  status: z.string(),
  report: ImportReportSchema,
});
export type ReferenceImportEntry = z.infer<typeof ReferenceImportEntrySchema>;

export const CellSummaryBucketSchema = z.object({
  key: z.string(),
  count: z.number().int(),
});
export type CellSummaryBucket = z.infer<typeof CellSummaryBucketSchema>;

export const CellSummarySchema = z.object({
  total: z.number().int(),
  by_rat: CellSummaryBucketSchema.array(),
  by_band_3gpp: CellSummaryBucketSchema.array(),
  by_dor: CellSummaryBucketSchema.array(),
  by_dr: CellSummaryBucketSchema.array(),
  // Dimension ARCEP (bc4-back 0.7.1) : orthogonale à la géo, pas dans
  // `/geo/tree`. Lignes NULL déclarées sous la clé `"N/D"` (comme les
  // autres buckets du summary) — jamais remplacées par 0.
  arcep_breakdown: CellSummaryBucketSchema.array(),
});
export type CellSummary = z.infer<typeof CellSummarySchema>;
