// Adaptateur KPI scopé projet (bc4-back 0.40.0+ catalog v2).
//
// 1.16.1 — Résilience : au lieu de laisser `apiFetch` lever
// `ApiSchemaError` et noircir la page, on fait un fetch brut + `safeParse`
// Zod. Si le contrat back ne colle pas, on lève une erreur TYPÉE
// `KpiContractMismatchError` qui porte la version observée + les
// messages Zod + le payload brut (bornés). La UI affiche alors un
// bandeau « contrat back incompatible » lisible, jamais un panneau gris.
//
// Les erreurs HTTP (401/404/500) + réseau remontent via les classes
// existantes `ApiHttpError` / `ApiNetworkError` (apiFetch les lève).
// Pour les lire dans useQuery, la UI consulte `query.error`.

import type { z } from "zod";

import {
  ApiHttpError,
  ApiNetworkError,
  ApiNotImplementedError,
  ApiSchemaError,
  ApiUnauthenticatedError,
  apiBase,
  apiFetch,
  apiOrMock,
  getSession,
  isApiMode,
} from "./http";
import {
  BackHealthSchema,
  ProjectKpiCatalogSchema,
  ProjectKpiDetailSchema,
  ProjectKpiFiltersSchema,
  type BackHealth,
  type KpiQueryFilters,
  type ProjectKpiCatalog,
  type ProjectKpiDetail,
  type ProjectKpiFilters,
} from "./project-kpi-schemas";

export class KpiContractMismatchError extends Error {
  readonly kind = "KpiContractMismatchError";
  readonly backVersion: string | null;
  readonly zodMessages: string[];
  readonly samplePath: string;
  constructor(backVersion: string | null, zodMessages: string[], samplePath: string) {
    super(
      `Contrat back incompatible${backVersion ? ` (back version ${backVersion})` : ""} : ${
        zodMessages[0] ?? "forme inattendue"
      }`,
    );
    this.name = "KpiContractMismatchError";
    this.backVersion = backVersion;
    this.zodMessages = zodMessages;
    this.samplePath = samplePath;
  }
}

export class KpiRequestError extends Error {
  readonly kind = "KpiRequestError";
  readonly status: number | null;
  readonly code: string | null;
  constructor(message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = "KpiRequestError";
    this.status = status;
    this.code = code;
  }
}

function encode(id: string): string {
  return encodeURIComponent(id);
}

function buildMultiQuery(
  params: Record<string, string[] | string | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === "" || item == null) continue;
        sp.append(k, item);
      }
      continue;
    }
    if (v === "") continue;
    sp.append(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Fetch brut + safeParse Zod. Toute non-conformité → KpiContractMismatchError. */
async function kpiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const session = getSession();
  const headers = new Headers({ Accept: "application/json" });
  if (session) headers.set("Authorization", `Bearer ${session.token}`);

  let res: Response;
  try {
    const init: RequestInit = { headers };
    if (signal) init.signal = signal;
    res = await fetch(`${apiBase()}${path}`, init);
  } catch (e) {
    throw new ApiNetworkError((e as Error).message || "Backend injoignable");
  }

  if (res.status === 401) {
    throw new ApiUnauthenticatedError("Session expirée ou invalide");
  }
  if (res.status === 501) {
    throw new ApiNotImplementedError("Endpoint non implémenté (B0)");
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-json */
    }
    const detail =
      body && typeof body === "object" && "detail" in (body as Record<string, unknown>)
        ? (body as { detail?: unknown }).detail
        : null;
    const message =
      detail && typeof detail === "object" && "message" in (detail as Record<string, unknown>)
        ? String((detail as { message?: unknown }).message)
        : res.statusText;
    const code =
      detail && typeof detail === "object" && "code" in (detail as Record<string, unknown>)
        ? String((detail as { code?: unknown }).code)
        : "HTTP_ERROR";
    throw new ApiHttpError(code, message || `HTTP ${res.status}`, res.status, body);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (e) {
    throw new KpiRequestError(`Réponse JSON invalide : ${(e as Error).message}`);
  }

  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  // 1.17.3 — AUCUN échec de parse n'est silencieux. On log console.error
  // AVANT de throw : React Query capture ensuite l'exception et la met
  // dans query.error, mais sans ce log le navigateur n'affiche RIEN
  // (symptôme vu sur /kpi : barre vide, console propre).
  const version =
    raw && typeof raw === "object" && "catalog_version" in (raw as Record<string, unknown>)
      ? String((raw as { catalog_version?: unknown }).catalog_version ?? "")
      : null;
  const messages = parsed.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(
    `[KPI contract] safeParse FAIL ${path}`,
    { backVersion: version, zodIssues: messages, sample: raw },
  );
  throw new KpiContractMismatchError(version || null, messages, path);
}

/** GET /projects/{project_id}/kpi/catalog */
export async function getProjectKpiCatalog(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectKpiCatalog> {
  if (isApiMode()) {
    return kpiFetch(
      `/projects/${encode(projectId)}/kpi/catalog`,
      ProjectKpiCatalogSchema,
      signal,
    );
  }
  // Mode mock : on garde le fallback historique.
  return ProjectKpiCatalogSchema.parse({
    project_id: projectId,
    catalog_version: "mock",
    tree: [],
  });
}

/** GET /projects/{project_id}/kpi/filters */
export async function getProjectKpiFilters(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectKpiFilters> {
  if (isApiMode()) {
    return kpiFetch(
      `/projects/${encode(projectId)}/kpi/filters`,
      ProjectKpiFiltersSchema,
      signal,
    );
  }
  return ProjectKpiFiltersSchema.parse({
    project_id: projectId,
    operators: [],
    rats: [],
    bands: [],
    service_types: [],
    envs: [],
    deps: [],
    phases: [],
  });
}

/** GET /projects/{project_id}/kpi/{code}?operator[]=... */
export async function getProjectKpi(
  projectId: string,
  code: string,
  filters: KpiQueryFilters = {},
  signal?: AbortSignal,
): Promise<ProjectKpiDetail> {
  const qs = buildMultiQuery({
    operator: filters.operator,
    service_type: filters.service_type,
    phase: filters.phase,
    band: filters.band,
    rat: filters.rat,
    env: filters.env,
    dep: filters.dep,
    dr: filters.dr,
    plaque: filters.plaque,
    dor: filters.dor,
    arcep: filters.arcep,
    commune: filters.commune,
    insee: filters.insee,
    group_by: filters.group_by,
  });
  const path = `/projects/${encode(projectId)}/kpi/${encode(code)}${qs}`;
  if (isApiMode()) {
    return kpiFetch(path, ProjectKpiDetailSchema, signal);
  }
  return ProjectKpiDetailSchema.parse({
    code,
    name: code,
    nature: "mock",
    unit: "",
    formula: "",
    source: "mock",
    status: "UNAVAILABLE",
    reason: "mode mock : aucun agrégat servi",
    value: null,
    n: 0,
    by_operator: [],
  });
}

/** GET /health — version du back, pour le bandeau d'incompatibilité
 *  (afficher catalog_version ET /health version séparément). Jamais
 *  bloquant : renvoie `null` si injoignable. */
export async function getBackHealth(signal?: AbortSignal): Promise<BackHealth | null> {
  try {
    const init: RequestInit = { headers: { Accept: "application/json" } };
    if (signal) init.signal = signal;
    const res = await fetch(`${apiBase()}/health`, init);
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    const parsed = BackHealthSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Suppress unused imports warnings in case apiFetch/apiOrMock aren't used
// anymore here — they're kept exported from http.ts for backward compat.
export const _unused = {
  apiFetch,
  apiOrMock,
  ApiHttpError,
  ApiSchemaError,
};
