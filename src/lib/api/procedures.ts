import { z } from "zod";

import { isApiMode } from "./http";
import { kpiFetch } from "./project-kpi";
import type {
  KpiQueryFilters,
  ProjectKpiCatalog,
  ProjectKpiDetail,
} from "./project-kpi-schemas";

const ProcedureResultSchema = z.enum([
  "ATTEMPT",
  "SUCCESS",
  "FAILURE",
  "ABNORMAL_RELEASE",
  "DROP",
  "TIMEOUT",
  "UNKNOWN",
]);
const EvidenceLevelSchema = z.enum(["PROVEN", "PROBABLE", "UNKNOWN"]);

export const ProcedureRowSchema = z.object({
  procedure_id: z.string(),
  project_id: z.string(),
  capture_id: z.string(),
  ue_key: z.string(),
  session_key: z.string(),
  rat: z.string(),
  procedure_type: z.string(),
  start_seq: z.number().int(),
  end_seq: z.number().int().nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  duration_ms: z.number().nullable(),
  source_pci: z.number().int().nullable(),
  source_arfcn: z.number().int().nullable(),
  target_pci: z.number().int().nullable(),
  target_arfcn: z.number().int().nullable(),
  bearer_id: z.number().int().nullable(),
  ebi: z.number().int().nullable(),
  qci: z.number().int().nullable(),
  qfi: z.number().int().nullable(),
  five_qi: z.number().int().nullable(),
  s_nssai: z.string().nullable(),
  result: ProcedureResultSchema,
  failure_cause: z.string().nullable(),
  evidence_level: EvidenceLevelSchema,
  source_event_ids: z.array(z.string()),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  gps_seq: z.number().int().nullable(),
  signaling_url: z.string(),
});

const ProcedureCatalogItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  unit: z.string(),
  procedure_types: z.array(z.string()),
  measure: z.string(),
  minimum_evidence: EvidenceLevelSchema,
  status: z.enum(["AVAILABLE", "UNAVAILABLE", "NOT_CERTIFIED"]),
  reason: z.string().nullable(),
  available: z.boolean(),
  map_supported: z.boolean(),
  replaces_code: z.string().nullable(),
  counts: z.object({
    attempts: z.number().int().nonnegative(),
    success: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
});

export const ProcedureCatalogSchema = z.object({
  project_id: z.string(),
  capture_ids: z.array(z.string()),
  engine_version: z.string(),
  tree: z.array(
    z.object({
      technology: z.string(),
      families: z.array(
        z.object({ family: z.string(), kpis: z.array(ProcedureCatalogItemSchema) }),
      ),
    }),
  ),
});

export const ProcedureListSchema = z.object({
  project_id: z.string(),
  capture_ids: z.array(z.string()),
  engine_version: z.string(),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
  rows: z.array(ProcedureRowSchema),
});

const ProcedureKpiSchema = z.object({
  code: z.string(),
  status: z.enum(["AVAILABLE", "UNAVAILABLE", "NOT_CERTIFIED"]),
  reason: z.string().nullable(),
  value: z.number().nullable(),
  attempts: z.number().int().nonnegative(),
  success: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative().nullable(),
  excluded: z.number().int().nonnegative(),
  name: z.string(),
  technology: z.string(),
  family: z.string(),
  unit: z.string(),
  description: z.string(),
  minimum_evidence: z.string(),
  formula: z.string(),
  population: z.string(),
  exclusions: z.string(),
});

export type ProcedureRow = z.infer<typeof ProcedureRowSchema>;
export type ProcedureList = z.infer<typeof ProcedureListSchema>;
export type ProcedureCatalog = z.infer<typeof ProcedureCatalogSchema>;

function capturesQuery(captureIds: string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const captureId of captureIds) query.append("capture_id", captureId);
  return query;
}

export async function getProcedureCatalog(
  projectId: string,
  captureIds: string[],
  signal?: AbortSignal,
): Promise<ProcedureCatalog> {
  if (!isApiMode())
    return ProcedureCatalogSchema.parse({
      project_id: projectId,
      capture_ids: captureIds,
      engine_version: "mock",
      tree: [],
    });
  const query = capturesQuery(captureIds);
  return kpiFetch(
    `/projects/${encodeURIComponent(projectId)}/procedures/catalog?${query}`,
    ProcedureCatalogSchema,
    signal,
  );
}

export function procedureCatalogAsKpiCatalog(catalog: ProcedureCatalog): ProjectKpiCatalog {
  return {
    project_id: catalog.project_id,
    catalog_version: catalog.engine_version,
    tree: catalog.tree.map((technology) => ({
      techno: technology.technology === "EN-DC" ? "ENDC" : technology.technology,
      families: technology.families.map((family) => ({
        family: family.family,
        kpis: family.kpis.map((item) => ({
          code: item.code,
          name: item.name,
          nature: item.measure === "rate" ? "rate" : "counter",
          analytics_tab: "kpi" as const,
          unit: item.unit,
          source: "procedure-v1",
          formula: item.measure === "rate" ? "100 × SUCCESS / (SUCCESS + FAILURE)" : item.measure,
          status:
            item.status === "AVAILABLE"
              ? ("AVAILABLE" as const)
              : item.status === "NOT_CERTIFIED"
                ? ("UNVALIDATED" as const)
                : ("UNAVAILABLE" as const),
          reason: item.reason,
          available: item.available,
          procedure_types: item.procedure_types,
          minimum_evidence: item.minimum_evidence,
          map_supported: item.map_supported,
          procedure_counts: item.counts,
          procedure_code: item.code,
          procedure_measure: item.measure,
          replaces_code: item.replaces_code ?? undefined,
        })),
      })),
    })),
  };
}

export async function getProcedureKpi(
  projectId: string,
  code: string,
  filters: KpiQueryFilters,
  signal?: AbortSignal,
): Promise<ProjectKpiDetail> {
  if (!isApiMode()) {
    return {
      code,
      name: code,
      nature: "counter",
      unit: null,
      formula: null,
      source: "mock",
      status: "UNAVAILABLE",
      reason: "No procedure evidence in mock mode.",
    };
  }
  const query = capturesQuery(filters.capture_id ? [filters.capture_id] : []);
  const result = await kpiFetch(
    `/projects/${encodeURIComponent(projectId)}/procedures/kpis/${encodeURIComponent(code)}?${query}`,
    ProcedureKpiSchema,
    signal,
  );
  const status = result.status === "AVAILABLE" ? "AVAILABLE" : result.status === "NOT_CERTIFIED" ? "UNVALIDATED" : "UNAVAILABLE";
  return {
    code: result.code,
    name: result.name,
    techno: result.technology,
    family: result.family,
    nature: result.unit === "%" ? "rate" : "counter",
    unit: result.unit,
    formula: result.formula,
    source: "procedure-v1",
    status,
    reason: result.reason,
    value: result.value,
    n: result.attempts,
    denominator: result.denominator,
    attempts: result.attempts,
    success: result.success,
    failures: result.failures,
    unknown: result.unknown,
    excluded: result.excluded,
    groups: [
      { operator: "Attempts", n: result.attempts, value: result.attempts },
      { operator: "Success", n: result.success, value: result.success },
      { operator: "Failures", n: result.failures, value: result.failures },
      { operator: "Unknown", n: result.unknown, value: result.unknown },
    ],
  };
}

export async function getProcedures(
  projectId: string,
  captureIds: string[],
  procedureTypes: string[],
  results: string[],
  page: number,
  size: number,
  signal?: AbortSignal,
): Promise<ProcedureList> {
  const query = capturesQuery(captureIds);
  for (const type of procedureTypes) query.append("procedure_type", type);
  for (const result of results) query.append("result", result);
  query.set("page", String(page));
  query.set("size", String(size));
  return kpiFetch(
    `/projects/${encodeURIComponent(projectId)}/procedures?${query}`,
    ProcedureListSchema,
    signal,
  );
}

export function resultsForProcedureMeasure(measure: string | undefined): string[] {
  if (measure === "success") return ["SUCCESS"];
  if (measure === "failures")
    return ["FAILURE", "ABNORMAL_RELEASE", "DROP", "TIMEOUT"];
  if (measure === "unknown") return ["ATTEMPT", "UNKNOWN"];
  return [];
}
