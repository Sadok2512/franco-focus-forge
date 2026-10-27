// Schémas spécifiques aux mutations de projets (B1-ingest).
// Le schéma Project (lecture, GET /projects) reste défini dans `./schemas.ts`.
// Ici on ajoute :
//   - `CreateProjectRequestSchema` : le body de POST /projects.
//   - `ProjectIngestViewSchema` : la réponse de POST /projects et la vue
//     "ingestion" côté bc4-back. Les résumés sont `null` tant qu'aucun
//     NMF n'a été ingéré — la UI les affiche « N/D », jamais 0.
import { z } from "zod";

export const CreateProjectRequestSchema = z.object({
  name: z
    .string()
    .min(1, "Le nom du projet est obligatoire.")
    .max(200, "Nom trop long (max 200 caractères)."),
  visibility: z.enum(["private", "public"]),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const ProjectIngestStatusSchema = z.enum(["draft", "importing", "ready", "error"]);
export type ProjectIngestStatus = z.infer<typeof ProjectIngestStatusSchema>;

export const ProjectIngestViewSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  visibility: z.enum(["private", "public"]),
  name: z.string(),
  created_at: z.string().nullable(),
  actor: z.string().nullable(),
  status: ProjectIngestStatusSchema,
  operators: z.record(z.string(), z.number().int()).nullable(),
  technos: z.record(z.string(), z.number().int()).nullable(),
  n_captures: z.number().int().nullable(),
  n_events: z.number().int().nullable(),
  gps_coverage_pct: z.number().nullable(),
});
export type ProjectIngestView = z.infer<typeof ProjectIngestViewSchema>;
