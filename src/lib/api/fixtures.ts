// DEMO-ONLY deterministic fixtures. Not real measurements.
import type { MeasurementPoint, Operator, Project, Service, Tech } from "./schemas";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PROJECTS: Project[] = [
  {
    id: "idf-t3-2026",
    owner_id: "mock-current-user",
    visibility: "private",
    name: "Paris 2026 Q1",
    geography: "Île-de-France (Paris + Petite Couronne)",
    center: [2.35, 48.86],
    operators: ["Orange", "SFR", "Bouygues", "Free"],
    technologies: ["LTE", "NR", "EN-DC"],
    services: ["Data", "SMS", "Voice"],
    bands: ["B3", "B7", "B20", "B28", "n78", "n28"],
    departements: ["75", "92", "93", "94"],
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    captures: 2400000,
    importedAt: "2026-04-02",
    status: "ready",
  },
  {
    id: "lyon-drive-2026",
    owner_id: "mock-current-user",
    visibility: "private",
    name: "Lyon Métropole",
    geography: "Auvergne-Rhône-Alpes",
    center: [4.84, 45.76],
    operators: ["Orange", "SFR"],
    technologies: ["LTE", "NR"],
    services: ["Data", "Voice"],
    bands: ["B3", "B20", "n78"],
    departements: ["69"],
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    captures: 850000,
    importedAt: "2026-03-02",
    status: "ready",
  },
  {
    id: "marseille-5g-2026",
    owner_id: "mock-current-user",
    visibility: "private",
    name: "Marseille 5G",
    geography: "PACA",
    center: [5.37, 43.296],
    operators: ["Orange", "Bouygues", "Free"],
    technologies: ["NR"],
    services: ["Data"],
    bands: ["n78", "n28"],
    departements: ["13"],
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    captures: 1200000,
    importedAt: "2026-02-03",
    status: "ready",
  },
  {
    id: "rennes-lte-2026",
    owner_id: "mock-current-user",
    visibility: "private",
    name: "Rennes LTE (sans NR)",
    geography: "Bretagne",
    center: [-1.68, 48.11],
    operators: ["Orange", "SFR", "Bouygues"],
    technologies: ["LTE"],
    services: ["Data", "Voice"],
    bands: ["B3", "B20", "B28"],
    departements: ["35"],
    periodStart: "2026-03-01",
    periodEnd: "2026-03-15",
    captures: 410000,
    importedAt: "2026-03-17",
    status: "ready",
  },
  {
    id: "lille-indoor-2026",
    owner_id: "mock-current-user",
    visibility: "private",
    name: "Tests Indoor",
    geography: "Bâtiment Orange Village",
    center: [2.24, 48.83],
    operators: ["Orange"],
    technologies: ["LTE"],
    services: ["Data"],
    bands: ["B3", "B7"],
    departements: ["92"],
    periodStart: "2026-01-10",
    periodEnd: "2026-01-20",
    captures: 320000,
    importedAt: "2026-01-22",
    status: "processing",
  },
  {
    id: "national-2026",
    owner_id: "mock-current-user",
    visibility: "private",
    name: "Benchmark National",
    geography: "France entière",
    center: [2.35, 46.8],
    operators: ["Orange", "SFR", "Bouygues", "Free"],
    technologies: ["LTE", "NR"],
    services: ["Data", "Voice"],
    bands: ["B3", "B20", "n78"],
    departements: ["75", "69", "13", "33", "59"],
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    captures: 5800000,
    importedAt: "2026-04-05",
    status: "ready",
  },
];

const pick = <T>(arr: readonly T[], r: () => number): T => arr[Math.floor(r() * arr.length)] as T;

const OP_BIAS: Record<Operator, number> = { Orange: 1.15, SFR: 0.95, Bouygues: 1.0, Free: 0.88 };
const pointCache = new Map<string, MeasurementPoint[]>();

export function pointsFor(project: Project): MeasurementPoint[] {
  const cached = pointCache.get(project.id);
  if (cached) return cached;
  const seed = [...project.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = mulberry32(seed);
  const n = project.status === "processing" ? 0 : Math.min(900, project.captures);
  const days = Math.max(
    1,
    (Date.parse(project.periodEnd) - Date.parse(project.periodStart)) / 864e5 + 1,
  );
  const pts: MeasurementPoint[] = [];
  for (let i = 0; i < n; i++) {
    const operator = pick(project.operators, r);
    const tech: Tech = pick(project.technologies, r);
    const service: Service = pick(project.services, r);
    const nrBands = project.bands.filter((b) => b.startsWith("n"));
    const lteBands = project.bands.filter((b) => !b.startsWith("n"));
    const pool = tech === "LTE" ? lteBands : nrBands.length ? nrBands : lteBands;
    const band = pick(pool, r);
    const dep = pick(project.departements, r);
    const dx = (r() - 0.5) * 0.28,
      dy = (r() - 0.5) * 0.16;
    // a deliberate weak zone in the NE quadrant to be "discovered"
    const weak = dx > 0.06 && dy > 0.03 ? 0.45 : 1;
    const bias = OP_BIAS[operator] * weak;
    const techMul = tech === "LTE" ? 1 : tech === "NR" ? 3.2 : 2.4;
    const miss = r();
    const day = Math.floor(r() * days);
    pts.push({
      id: `${project.id}-${i}`,
      lat: project.center[1] + dy,
      lng: project.center[0] + dx,
      operator,
      tech,
      service,
      band,
      dep,
      site: `S${dep}-${String(Math.floor(r() * 40)).padStart(3, "0")}`,
      ts: new Date(Date.parse(project.periodStart) + day * 864e5 + r() * 864e5).toISOString(),
      dl: miss < 0.04 ? null : +Math.max(0.5, (20 + r() * 60) * techMul * bias).toFixed(1),
      rsrp: miss > 0.97 ? null : +(-118 + r() * 40 * Math.min(1, bias)).toFixed(1),
      sinr: miss > 0.95 ? null : +(-3 + r() * 26 * Math.min(1, bias)).toFixed(1),
      latency: service === "SMS" ? null : +(18 + (r() * 40) / bias).toFixed(0),
    });
  }
  pointCache.set(project.id, pts);
  return pts;
}

/* ---------- Catalogue KPI (démo) ---------- */
export const KPI_CATALOG = [
  {
    group: "Accessibilité",
    items: ["RRC Success Rate", "RRC Setup Time", "Initial Attach Success"],
  },
  { group: "Rétention", items: ["Drop Call Rate", "RRC Abnormal Release"] },
  { group: "Mobilité", items: ["HO Success Rate", "HO Interruption Time"] },
  { group: "Débit", items: ["Throughput DL", "Throughput UL"] },
  { group: "Qualité radio", items: ["RSRP moyen", "SINR moyen"] },
  { group: "Voix", items: ["VoLTE Setup Success", "MOS"] },
  { group: "NR / EN-DC", items: ["SgNB Addition Success", "EN-DC Ratio"] },
];
export const KPI_RRC = {
  name: "RRC Success Rate",
  description: "Taux de succès de l'établissement d'une connexion RRC.",
  value: 98.2,
  delta: 0.3,
  samples: 2400000,
  techs: "LTE, NR",
  unit: "%",
  byOp: { Orange: 98.5, SFR: 97.8, Bouygues: 98.1, Free: 97.9 } as Record<Operator, number>,
};

/* ---------- Assistant IA (démo) ---------- */
