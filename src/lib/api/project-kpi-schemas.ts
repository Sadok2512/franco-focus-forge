// Zod schemas pour les endpoints KPI scopés projet (bc4-back 0.40.0+).
//
// 1.16.2 — Aligné sur la RÉPONSE réelle du back (lue via curl + jq
// contre /projects/{REF}/kpi/catalog, back 0.40.0). Observations qui
// motivent ce patch :
//
//   - `counts_by_techno` est un record **imbriqué**
//     `Record<techno, Record<status, number>>` — pas un flat
//     `Record<techno, number>`. Le back ne retourne PAS de clé `total` :
//     on l'affichera côté UI en additionnant les 4 statuts observés
//     (jamais inventé, additionné depuis les valeurs back).
//   - `formula` / `source` / `unit` / `reason` peuvent être `null` sur
//     certains KPI calculés — rendus « — » côté UI.
//   - `passthrough()` partout : tout nouveau champ ajouté par le back
//     est toléré, jamais la cause d'une page vide.
//
// L'OpenAPI du back ne décrit pas la forme des 3 routes `/projects/*/kpi/*`
// (handlers FastAPI sans `response_model`) — la source de vérité est
// donc la **réponse live** du back. Le script `bun run contract:check`
// (CHANGELOG 1.16.2) fait un live-check safeParse contre ce schéma.

import { z } from "zod";

export const KpiStatusSchema = z.enum([
  "AVAILABLE",
  "PENDING",
  "UNVALIDATED",
  "UNAVAILABLE",
  "NOT_APPLICABLE",
]);

export type KpiStatus = z.infer<typeof KpiStatusSchema>;

/* ---------- /projects/{id}/kpi/catalog (v2 réel) ---------- */

export const KpiCatalogItemSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    nature: z.string(),
    // nullable (patch 1.16.2) : certains KPI calculés ont `unit=null`.
    unit: z.string().nullable(),
    source: z.string().nullable(),
    temporal_source: z.string().nullable().optional(),
    formula: z.string().nullable(),
    service_scope: z.array(z.string()).optional(),
    aliases: z.array(z.string()).optional(),
    status: KpiStatusSchema,
    reason: z.string().nullable(),
  })
  .passthrough();

export const KpiCatalogFamilySchema = z
  .object({
    family: z.string(),
    kpis: KpiCatalogItemSchema.array(),
  })
  .passthrough();

export const KpiCatalogTechnoSchema = z
  .object({
    techno: z.string(),
    families: KpiCatalogFamilySchema.array(),
  })
  .passthrough();

// counts_by_techno : Record<techno, Record<status, number>>. Pas de
// `total` renvoyé par le back ; la UI l'additionne depuis les 4 statuts.
export const KpiCountsByTechnoSchema = z.record(z.record(z.number().int().nonnegative()));
export const KpiCountsByStatusSchema = z.record(z.number().int().nonnegative());

export const ProjectKpiCatalogSchema = z
  .object({
    project_id: z.string(),
    catalog_version: z.string(),
    canonical_count: z.number().int().nonnegative().optional(),
    aliases_count: z.number().int().nonnegative().optional(),
    counts_by_status: KpiCountsByStatusSchema.optional(),
    counts_by_techno: KpiCountsByTechnoSchema.optional(),
    tree: KpiCatalogTechnoSchema.array(),
  })
  .passthrough();

export type KpiCatalogItem = z.infer<typeof KpiCatalogItemSchema>;
export type KpiCatalogFamily = z.infer<typeof KpiCatalogFamilySchema>;
export type KpiCatalogTechno = z.infer<typeof KpiCatalogTechnoSchema>;
export type ProjectKpiCatalog = z.infer<typeof ProjectKpiCatalogSchema>;
export type KpiCountsByTechno = z.infer<typeof KpiCountsByTechnoSchema>;

/* ---------- /projects/{id}/kpi/filters (v2 réel, dimension-aware) ----------
 *
 * Le back 0.41.0 enveloppe chaque dimension dans `{available, reason, values}`.
 * `available=false` → la dimension n'est pas calculée pour ce projet
 * (ex. `deps` sans `cell_ref`), raison explicite dans `reason`.
 * Pour la compat avec les anciens callers qui attendaient `string[]`,
 * on expose un helper `.values` toujours présent (array vide si N/D).
 */
// 1.17.3 — **TOUT optionnel**. Un champ absent ne doit JAMAIS casser le
// safeParse. La barre est rendue depuis la liste constante
// `EXPECTED_FILTER_DIMS` (cf. _app.kpi.tsx), pas depuis la réponse ;
// une dimension non conforme devient un chip « forme inattendue ».
export const KpiFilterDimensionSchema = z
  .object({
    available: z.boolean().optional(),
    reason: z.string().nullable().optional(),
    values: z.string().array().optional(),
  })
  .passthrough();
export type KpiFilterDimension = z.infer<typeof KpiFilterDimensionSchema>;

// 1.17.3 — TOUTES les dimensions optionnelles. La barre front rend TOUJOURS
// la LISTE CONSTANTE `EXPECTED_FILTER_DIMS` (jamais la réponse). Une
// dim absente de la réponse → chip grisé « forme inattendue ».
export const ProjectKpiFiltersSchema = z
  .object({
    project_id: z.string().optional(),
    operators: KpiFilterDimensionSchema.optional(),
    rats: KpiFilterDimensionSchema.optional(),
    bands: KpiFilterDimensionSchema.optional(),
    service_types: KpiFilterDimensionSchema.optional(),
    envs: KpiFilterDimensionSchema.optional(),
    deps: KpiFilterDimensionSchema.optional(),
    phases: KpiFilterDimensionSchema.optional(),
    ecgi: KpiFilterDimensionSchema.optional(),
    dr: KpiFilterDimensionSchema.optional(),
    plaque: KpiFilterDimensionSchema.optional(),
    dor: KpiFilterDimensionSchema.optional(),
    arcep: KpiFilterDimensionSchema.optional(),
    commune: KpiFilterDimensionSchema.optional(),
    insee: KpiFilterDimensionSchema.optional(),
  })
  .passthrough();
export type ProjectKpiFilters = z.infer<typeof ProjectKpiFiltersSchema>;

/* ---------- /projects/{id}/kpi/{code} (v2 réel) ---------- */

export const KpiByOperatorSchema = z
  .object({
    operator: z.string().nullable(),
    n: z.number().int().nonnegative(),
    value: z.number().nullable().optional(),
  })
  .passthrough();

// bc4-back 0.42.0 — group_by response : `groups[]` = {operator?, band?,
// n, p10/p50/p90?, status, reason, operator_color?, band_color?}.
export const KpiGroupRowSchema = z
  .object({
    operator: z.string().nullable().optional(),
    band: z.string().nullable().optional(),
    dor: z.string().nullable().optional(), // 1.18.0 — group_by=dor
    n: z.number().int().nonnegative(),
    p10: z.number().nullable().optional(),
    p50: z.number().nullable().optional(),
    p90: z.number().nullable().optional(),
    status: z.string().optional(),
    reason: z.string().nullable().optional(),
    operator_color: z.string().optional(),
    band_color: z.string().optional(),
  })
  .passthrough();
export type KpiGroupRow = z.infer<typeof KpiGroupRowSchema>;

export const ProjectKpiDetailSchema = z
  .object({
    requested_code: z.string().optional(),
    code: z.string(),
    name: z.string(),
    techno: z.string().optional(),
    family: z.string().optional(),
    nature: z.string(),
    unit: z.string().nullable(),
    formula: z.string().nullable(),
    source: z.string().nullable(),
    service_scope: z.array(z.string()).optional(),
    aliases: z.array(z.string()).optional(),
    services_requested: z.array(z.string()).optional(),
    operators_requested: z.array(z.string()).optional(),
    phases_requested: z.array(z.string()).optional(),
    status: KpiStatusSchema,
    reason: z.string().nullable(),
    value: z.number().nullable().optional(),
    n: z.number().int().nonnegative().optional(),
    p10: z.number().nullable().optional(),
    p50: z.number().nullable().optional(),
    p90: z.number().nullable().optional(),
    by_operator: KpiByOperatorSchema.array().optional(),
    // bc4-back 0.42.0 — groups/table pour group_by.
    group_by: z.string().optional(),
    groups: KpiGroupRowSchema.array().optional(),
    table: KpiGroupRowSchema.array().optional(),
  })
  .passthrough();

export type ProjectKpiDetail = z.infer<typeof ProjectKpiDetailSchema>;
export type KpiByOperator = z.infer<typeof KpiByOperatorSchema>;

/* ---------- Query input (filters passed to /kpi/{code}) ---------- */

export type KpiGroupBy = "operator" | "band" | "operator_band" | "dor";

export type KpiQueryFilters = {
  operator?: string[];
  service_type?: string[];
  phase?: string[];
  band?: string[];
  rat?: string[];
  env?: string[];
  dep?: string[];
  dr?: string[];
  plaque?: string[];
  dor?: string[];
  arcep?: string[];
  commune?: string[];
  insee?: string[];
  group_by?: KpiGroupBy;
};

/* ---------- /health (back) — pour le bandeau d'erreur ---------- */

export const BackHealthSchema = z
  .object({
    status: z.string(),
    env: z.string(),
    version: z.string(),
  })
  .passthrough();
export type BackHealth = z.infer<typeof BackHealthSchema>;
