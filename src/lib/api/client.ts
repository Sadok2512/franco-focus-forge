import { OverviewPointSchema, type OverviewPoint } from "./schemas";
// Typed API adapter. UI only talks to these functions.
// Dispatch: VITE_BC4_DATA=api → HTTP vers bc4-back, sinon → mock local.
// Les schémas Zod existants sont la source de parité au runtime.
import { apiFetch, apiOrMock, buildQuery, isApiMode } from "./http";
import { KPI_CATALOG, KPI_RRC } from "./fixtures";
import { PROJECTS, pointsFor } from "./fixtures";
import { findMockProjectForDemo, listMockProjectsForDemo } from "./projects";
import {
  METRICS,
  ProjectSchema,
  type FilterContext,
  type MeasurementPoint,
  type MetricKey,
  type MetricValue,
  type Operator,
  type Project,
  type SourceReference,
} from "./schemas";
import { z } from "zod";

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      rej(new DOMException("Aborted", "AbortError"));
    });
  });

export async function getProjects(signal?: AbortSignal): Promise<Project[]> {
  return apiOrMock(
    () => apiFetch("/projects", ProjectSchema.array(), { signal }),
    async () => {
      await delay(250, signal);
      // Fusionne les créations mock (localStorage) devant les seeds.
      return ProjectSchema.array().parse(listMockProjectsForDemo());
    },
    "getProjects",
  );
}

export async function getProject(id: string, signal?: AbortSignal): Promise<Project> {
  return apiOrMock(
    () => apiFetch(`/projects/${encodeURIComponent(id)}`, ProjectSchema, { signal }),
    async () => {
      await delay(120, signal);
      const p = findMockProjectForDemo(id) ?? PROJECTS.find((x) => x.id === id);
      if (!p) throw { code: "NOT_FOUND", message: "Projet introuvable" };
      return ProjectSchema.parse(p);
    },
    "getProject",
  );
}

export function applyFilters(pts: MeasurementPoint[], f: FilterContext) {
  return pts.filter(
    (p) =>
      (!f.op?.length || f.op.includes(p.operator)) &&
      (!f.tech?.length || f.tech.includes(p.tech)) &&
      (!f.svc?.length || f.svc.includes(p.service)) &&
      (!f.band?.length || f.band.includes(p.band)) &&
      (!f.dep?.length || f.dep.includes(p.dep)),
  );
}

function mean(vals: (number | null)[]) {
  const v = vals.filter((x): x is number => x != null);
  return {
    value: v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null,
    n: v.length,
    missing: vals.length - v.length,
  };
}

export type OverviewData = {
  project: Project;
  points: OverviewPoint[];
  kpis: MetricValue[];
  byOperator: {
    operator: Operator;
    samples: number;
    dl: number | null;
    rsrp: number | null;
    sinr: number | null;
    latency: number | null;
  }[];
  trend: { day: string; series: Partial<Record<Operator, number | null>> }[];
  source: SourceReference;
};

// Zod shape for the overview response — mirrors OverviewData for the HTTP
// branch. Mock branch keeps its historical construction.
const OverviewSchema = z.object({
  project: ProjectSchema,
  points: z.array(OverviewPointSchema),
  kpis: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      unit: z.string(),
      value: z.number().nullable(),
      sampleCount: z.number().int(),
      missingCount: z.number().int(),
    }),
  ),
  byOperator: z.array(
    z.object({
      operator: z.enum(["Orange", "SFR", "Bouygues", "Free"]),
      samples: z.number().int(),
      dl: z.number().nullable(),
      rsrp: z.number().nullable(),
      sinr: z.number().nullable(),
      latency: z.number().nullable(),
    }),
  ),
  trend: z.array(
    z.object({ day: z.string(), series: z.record(z.string(), z.number().nullable()) }),
  ),
  source: z.object({
    label: z.string(),
    population: z.string(),
    sampleCount: z.number().int(),
    missingCount: z.number().int(),
    demo: z.literal(true),
  }),
});

export async function getOverview(f: FilterContext, signal?: AbortSignal): Promise<OverviewData> {
  return apiOrMock(
    async () => {
      const qs = buildQuery({
        op: f.op,
        tech: f.tech,
        svc: f.svc,
        band: f.band,
        dep: f.dep,
        metric: f.metric,
      });
      const path = `/projects/${encodeURIComponent(f.project!)}/overview${qs}`;
      return (await apiFetch(path, OverviewSchema, { signal })) as OverviewData;
    },
    async () => _mockGetOverview(f, signal),
    "getOverview",
  );
}

async function _mockGetOverview(f: FilterContext, signal?: AbortSignal): Promise<OverviewData> {
  await delay(300, signal);
  const project = await getProject(f.project!, signal);
  const points = applyFilters(pointsFor(project), f);
  const mk = (
    key: string,
    label: string,
    unit: string,
    sel: (p: MeasurementPoint) => number | null,
    pop = points,
  ): MetricValue => {
    const m = mean(pop.map(sel));
    return { key, label, unit, value: m.value, sampleCount: m.n, missingCount: m.missing };
  };
  const lte = points.filter((p) => p.tech === "LTE");
  const nr = points.filter((p) => p.tech !== "LTE");
  const endc = points.filter((p) => p.tech === "EN-DC");
  const kpis: MetricValue[] = [
    mk("dl_lte", "Débit DL LTE", "Mbit/s", (p) => p.dl, lte),
    mk("dl_nr", "Débit DL NR", "Mbit/s", (p) => p.dl, nr),
    mk("rsrp", "RSRP LTE", "dBm", (p) => p.rsrp, lte),
    mk("ssrsrp", "SS-RSRP NR", "dBm", (p) => p.rsrp, nr),
    mk("sinr", "SINR", "dB", (p) => p.sinr),
    mk("latency", "Latence", "ms", (p) => p.latency),
    mk("endc", "Débit EN-DC", "Mbit/s", (p) => p.dl, endc),
  ];
  const byOperator = project.operators.map((operator) => {
    const pop = points.filter((p) => p.operator === operator);
    return {
      operator,
      samples: pop.length,
      dl: mean(pop.map((p) => p.dl)).value,
      rsrp: mean(pop.map((p) => p.rsrp)).value,
      sinr: mean(pop.map((p) => p.sinr)).value,
      latency: mean(pop.map((p) => p.latency)).value,
    };
  });
  const metric: MetricKey = f.metric ?? "dl";
  const days = [...new Set(points.map((p) => p.ts.slice(0, 10)))].sort();
  const trend = days.map((day) => ({
    day,
    series: Object.fromEntries(
      project.operators.map((op) => [
        op,
        mean(points.filter((p) => p.operator === op && p.ts.startsWith(day)).map((p) => p[metric]))
          .value,
      ]),
    ) as Partial<Record<Operator, number | null>>,
  }));
  const missing = points.filter((p) => p[metric] == null).length;
  return {
    project,
    points,
    kpis,
    byOperator,
    trend,
    source: {
      label: `Fixture démo — ${project.name}`,
      population: `${points.length} points de mesure filtrés`,
      sampleCount: points.length - missing,
      missingCount: missing,
      demo: true,
    },
  };
}

export { METRICS };

// Shape for GET /kpi/catalog — the Zod match of the mock-returned object.
const KpiCatalogSchema = z.object({
  catalog: z.array(z.object({ group: z.string(), items: z.array(z.string()) })),
  kpi: z.object({
    name: z.string(),
    description: z.string(),
    value: z.number(),
    delta: z.number(),
    samples: z.number().int(),
    techs: z.string(),
    unit: z.string(),
    byOp: z.record(z.string(), z.number()),
  }),
});

export async function getKpiCatalog(signal?: AbortSignal) {
  return apiOrMock(
    () => apiFetch("/kpi/catalog", KpiCatalogSchema, { signal }),
    async () => {
      await delay(150, signal);
      return { catalog: KPI_CATALOG, kpi: KPI_RRC };
    },
    "getKpiCatalog",
  );
}

export * from "./dictionary";
export * from "./assistant";
export type * from "./assistant-schemas";
export * from "./settings";
export type * from "./settings-schemas";
export * from "./reference";
export type * from "./reference-schemas";
export { createProject, deleteProject, getImportReport, uploadNmfFiles } from "./projects";
export type { NmfPerFileProgress, NmfUploadOptions } from "./projects";
export type * from "./nmf-schemas";
export type * from "./project-schemas";

// RRC v2 uses the shared API client entry point.
export {
  getDictMap as getDictV2Map,
  getDictTree as getDictV2Tree,
  getDictFilterOptions as getDictV2FilterOptions,
  getDictParam as getDictV2Param,
  getDictDistribution as getDictV2Distribution,
} from "./dict-v2";

// Project-scoped KPI Analytics adapters (shared UI entry point).
export { getProjectKpi, getProjectKpiCatalog, getProjectKpiFilters } from "./project-kpi";
export { getDictTemplates, getDictTemplateSummary } from "./dict-templates";
export { updateDictTemplate } from "./dict-templates";

export {
  getProjectTasks,
  getTaskSeries,
  getAnalyticsResult,
  getKpiAxes,
  getTaskPoints,
} from "./task-analytics";

export { getMetrics, getMetricCaptures, getMetricSeries, getCaptureEvents } from "./metrics";

export { getDecodeStatus, startDeepDecode, getUnknownMetrics } from "./decode";

export { getSignaling, getSignalingCapture, getSignalingMessages, getSignalingPayload, listSignalingCaptures, setSignalingProjectId } from "./signaling";

export { getMetricAnalysis } from "./metrics";
