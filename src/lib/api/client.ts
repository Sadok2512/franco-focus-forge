import { RRC_TREE, RRC_FIELD, KPI_CATALOG, KPI_RRC, CONVERSATIONS, SUGGESTIONS, ASSISTANT_ANSWER } from "./fixtures";
// Typed mock API adapter. UI only talks to these functions.
import { PROJECTS, pointsFor } from "./fixtures";
import {
  METRICS, ProjectSchema, type FilterContext, type MeasurementPoint, type MetricKey,
  type MetricValue, type Operator, type Project, type SourceReference,
} from "./schemas";

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Aborted", "AbortError")); });
  });

export async function getProjects(signal?: AbortSignal): Promise<Project[]> {
  await delay(250, signal);
  return ProjectSchema.array().parse(PROJECTS);
}

export async function getProject(id: string, signal?: AbortSignal): Promise<Project> {
  await delay(120, signal);
  const p = PROJECTS.find((x) => x.id === id);
  if (!p) throw { code: "NOT_FOUND", message: "Projet introuvable" };
  return p;
}

export function applyFilters(pts: MeasurementPoint[], f: FilterContext) {
  return pts.filter((p) =>
    (!f.op?.length || f.op.includes(p.operator)) &&
    (!f.tech?.length || f.tech.includes(p.tech)) &&
    (!f.svc?.length || f.svc.includes(p.service)) &&
    (!f.band?.length || f.band.includes(p.band)) &&
    (!f.dep?.length || f.dep.includes(p.dep)));
}

function mean(vals: (number | null)[]) {
  const v = vals.filter((x): x is number => x != null);
  return { value: v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null, n: v.length, missing: vals.length - v.length };
}

export type OverviewData = {
  project: Project;
  points: MeasurementPoint[];
  kpis: MetricValue[];
  byOperator: { operator: Operator; samples: number; dl: number | null; rsrp: number | null; sinr: number | null; latency: number | null }[];
  trend: { day: string; series: Partial<Record<Operator, number | null>> }[];
  source: SourceReference;
};

export async function getOverview(f: FilterContext, signal?: AbortSignal): Promise<OverviewData> {
  await delay(300, signal);
  const project = await getProject(f.project!, signal);
  const points = applyFilters(pointsFor(project), f);
  const mk = (key: string, label: string, unit: string, sel: (p: MeasurementPoint) => number | null, pop = points): MetricValue => {
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
      operator, samples: pop.length,
      dl: mean(pop.map((p) => p.dl)).value, rsrp: mean(pop.map((p) => p.rsrp)).value,
      sinr: mean(pop.map((p) => p.sinr)).value, latency: mean(pop.map((p) => p.latency)).value,
    };
  });
  const metric: MetricKey = f.metric ?? "dl";
  const days = [...new Set(points.map((p) => p.ts.slice(0, 10)))].sort();
  const trend = days.map((day) => ({
    day,
    series: Object.fromEntries(project.operators.map((op) => [
      op, mean(points.filter((p) => p.operator === op && p.ts.startsWith(day)).map((p) => p[metric])).value,
    ])) as Partial<Record<Operator, number | null>>,
  }));
  const missing = points.filter((p) => p[metric] == null).length;
  return {
    project, points, kpis, byOperator, trend,
    source: {
      label: `Fixture démo — ${project.name}`, population: `${points.length} points de mesure filtrés`,
      sampleCount: points.length - missing, missingCount: missing, demo: true,
    },
  };
}

export { METRICS };

export async function getRrcDictionary(signal?: AbortSignal) {
  await delay(150, signal);
  return { tree: RRC_TREE, field: RRC_FIELD };
}
export async function getKpiCatalog(signal?: AbortSignal) {
  await delay(150, signal);
  return { catalog: KPI_CATALOG, kpi: KPI_RRC };
}
export async function getAssistant(signal?: AbortSignal) {
  await delay(150, signal);
  return { conversations: CONVERSATIONS, suggestions: SUGGESTIONS, answer: ASSISTANT_ANSWER };
}
