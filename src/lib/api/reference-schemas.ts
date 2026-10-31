// Contrats B1-réf. Alignés 1:1 avec `app/schemas/reference.py` côté bc4-back.
// Un écart Zod ↔ Pydantic doit faire échouer la validation runtime,
// jamais être « lissé » par un défaut : null reste null, affiché « N/D ».
import { z } from "zod";

// -----------------------------------------------------------------------
// 1.19.0 — POST /settings/cell-ref/upload (bc4-back 0.47.1).
// Réponse : {status, status_reason, reject_reasons, processed, matched,
// inserted, updated_lines, cells_affected, source_path, …}. `status` ∈
// {"ok","rejected"}. UI : status="rejected" → bandeau rouge avec
// status_reason + ventilation reject_reasons. Jamais un bandeau vert
// si cells_affected = 0. `.passthrough()` : nouveaux champs back ne
// cassent pas le safeParse.
// -----------------------------------------------------------------------
export const CellRefUploadReportSchema = z
  .object({
    reference_id: z.string(),
    filename: z.string(),
    sha256: z.string().optional(),
    size_bytes: z.number().int().nonnegative().optional(),
    source_path: z.string().nullable().optional(),
    status: z.enum(["ok", "rejected"]),
    status_reason: z.string().nullable().optional(),
    processed: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
    cells_affected: z.number().int().nonnegative().optional(),
    inserted: z.number().int().nonnegative(),
    updated_lines: z.number().int().nonnegative().optional(),
    skipped_empty: z.number().int().nonnegative().optional(),
    not_found: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative().optional(),
    reject_reasons: z.record(z.string(), z.number().int()).optional(),
    rejected_detail: z.array(z.unknown()).optional(),
    ambiguous_detail: z.array(z.unknown()).optional(),
    warnings: z.array(z.string()).optional(),
  })
  .passthrough();
export type CellRefUploadReport = z.infer<typeof CellRefUploadReportSchema>;

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

export const CellReferenceJobAcceptedSchema = z.object({
  job_id: z.string(),
  status: z.literal("queued"),
  filename: z.string(),
  source_bytes: z.number().int().nonnegative(),
});

export const CellReferenceJobSchema = z.object({
  job_id: z.string(),
  filename: z.string(),
  uploaded_at: z.string(),
  status: z.enum(["queued", "running", "completed", "empty", "failed"]),
  progress_percent: z.number().int().min(0).max(100),
  rows_read: z.number().int().nonnegative(),
  rows_loaded: z.number().int().nonnegative(),
  rows_rejected: z.number().int().nonnegative(),
  report: ImportReportSchema.nullable(),
  error: z.object({ code: z.string(), reason: z.string() }).nullable(),
});
export type CellReferenceJob = z.infer<typeof CellReferenceJobSchema>;

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
  // 1.126.7 BC3 — nullable pour accepter les imports legacy renvoyés par
  // le back 0.117.3 avec `report: null` (format pré-0.117.2 non convertible).
  report: ImportReportSchema.nullable(),
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
