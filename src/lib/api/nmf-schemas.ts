// Contrats B1-ingest. Alignés 1:1 avec le Pydantic `NmfImportReport` du
// bc4-back. Toute dérive côté backend doit faire LEVER la validation Zod :
// un rapport mal formé n'est jamais lissé par un défaut.
//
// Règles dures côté UI :
//   - `error_msg` est `string | null` : on affiche la chaîne telle quelle,
//     jamais tronquée en silence.
//   - `gps_coverage_pct` est `number | null` : la UI affiche « N/D »
//     quand c'est `null`, jamais 0.
import { z } from "zod";

export const NmfFileStatusSchema = z.enum(["pending", "decoding", "done", "error"]);
export type NmfFileStatus = z.infer<typeof NmfFileStatusSchema>;

// Côté back la ligne par fichier s'appelle `NmfFileEntry`. On expose les
// deux noms pour que le code UI puisse rester lisible ("report par fichier")
// tout en gardant l'alignement 1:1 avec le Pydantic.
export const NmfFileReportSchema = z.object({
  filename: z.string(),
  status: NmfFileStatusSchema,
  n_captures: z.number().int(),
  n_events: z.number().int(), // L3 messages décodés (RRCSM/SIPSM/L3SM)
  n_gps: z.number().int(), // COUNT(event_code='GPS')
  // Le back permet un décodeur "unknown" tant que l'erreur frappe très tôt :
  // la valeur peut être `null`. On n'invente pas de version factice.
  decoder_version: z.string().nullable(),
  error_msg: z.string().nullable(),
  // NMFHE2 — champs additifs. `imported_at` = `nmf_file.uploaded_at` ;
  // `n_records` = somme `nmf_capture.n_records` pour ce fichier.
  // Nullable + optional : rétro-compat si back pas encore à jour.
  imported_at: z.string().nullable().optional(),
  n_records: z.number().int().nullable().optional(),
  // Clés applicatives réelles : toute suppression utilise
  // (project_id, capture_id), jamais le nom ou l'horodatage du fichier.
  capture_ids: z.array(z.string()).optional(),
});
export type NmfFileReport = z.infer<typeof NmfFileReportSchema>;
export const NmfFileEntrySchema = NmfFileReportSchema;
export type NmfFileEntry = NmfFileReport;

export const NmfImportReportSchema = z.object({
  files_received: z.number().int(),
  files_done: z.number().int(),
  files_error: z.number().int(),
  by_file: z.array(NmfFileReportSchema),
  n_captures: z.number().int(),
  n_events: z.number().int(),
  gps_coverage_pct: z.number().nullable(),
  operators_seen: z.record(z.string(), z.number().int()),
  technos_seen: z.record(z.string(), z.number().int()),
});
export type NmfImportReport = z.infer<typeof NmfImportReportSchema>;

export const NmfImportJobSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  status: z.enum(["queued", "decoding", "finalizing", "done", "error"]),
  files_total: z.number().int().nonnegative(),
  files_done: z.number().int().nonnegative(),
  files_error: z.number().int().nonnegative(),
  by_file: z.array(NmfFileEntrySchema),
  error_msg: z.string().nullable(),
  report: NmfImportReportSchema.nullable(),
});
export type NmfImportJob = z.infer<typeof NmfImportJobSchema>;
