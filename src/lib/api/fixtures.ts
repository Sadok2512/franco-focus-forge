// DEMO-ONLY deterministic fixtures. Not real measurements.
import type { MeasurementPoint, Operator, Project, Service, Tech } from "./schemas";

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PROJECTS: Project[] = [
  {
    id: "idf-t3-2026", name: "Campagne Île-de-France T3 2026", geography: "Plaque Paris / DR IDF",
    center: [2.35, 48.86], operators: ["Orange", "SFR", "Bouygues", "Free"], technologies: ["LTE", "NR", "EN-DC"],
    services: ["Data", "SMS", "Voice"], bands: ["B3", "B7", "B20", "n78"], departements: ["75", "92", "93", "94"],
    periodStart: "2026-07-01", periodEnd: "2026-07-14", captures: 1284, importedAt: "2026-07-16", status: "ready",
  },
  {
    id: "lyon-drive-2026", name: "Drive test Lyon Métropole", geography: "Plaque Sud-Est / DR Rhône",
    center: [4.84, 45.76], operators: ["Orange", "SFR", "Bouygues"], technologies: ["LTE", "NR"],
    services: ["Data", "Voice"], bands: ["B3", "B20", "n78"], departements: ["69"],
    periodStart: "2026-08-04", periodEnd: "2026-08-08", captures: 412, importedAt: "2026-08-10", status: "ready",
  },
  {
    id: "lille-indoor-2026", name: "Indoor Gare Lille Flandres", geography: "Plaque Nord / DR Hauts-de-France",
    center: [3.07, 50.637], operators: ["Orange", "Free"], technologies: ["LTE"],
    services: ["Data"], bands: ["B3", "B7"], departements: ["59"],
    periodStart: "2026-09-12", periodEnd: "2026-09-12", captures: 38, importedAt: "2026-09-14", status: "processing",
  },
];

const OP_BIAS: Record<Operator, number> = { Orange: 1.15, SFR: 0.95, Bouygues: 1.0, Free: 0.88 };
const pointCache = new Map<string, MeasurementPoint[]>();

export function pointsFor(project: Project): MeasurementPoint[] {
  const cached = pointCache.get(project.id);
  if (cached) return cached;
  const seed = [...project.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = mulberry32(seed);
  const n = project.status === "processing" ? 0 : Math.min(900, project.captures);
  const days = Math.max(1, (Date.parse(project.periodEnd) - Date.parse(project.periodStart)) / 864e5 + 1);
  const pts: MeasurementPoint[] = [];
  for (let i = 0; i < n; i++) {
    const operator = project.operators[Math.floor(r() * project.operators.length)];
    const tech: Tech = project.technologies[Math.floor(r() * project.technologies.length)];
    const service: Service = project.services[Math.floor(r() * project.services.length)];
    const nrBands = project.bands.filter((b) => b.startsWith("n"));
    const lteBands = project.bands.filter((b) => !b.startsWith("n"));
    const pool = tech === "LTE" ? lteBands : nrBands.length ? nrBands : lteBands;
    const band = pool[Math.floor(r() * pool.length)];
    const dep = project.departements[Math.floor(r() * project.departements.length)];
    const dx = (r() - 0.5) * 0.28, dy = (r() - 0.5) * 0.16;
    // a deliberate weak zone in the NE quadrant to be "discovered"
    const weak = dx > 0.06 && dy > 0.03 ? 0.45 : 1;
    const bias = OP_BIAS[operator] * weak;
    const techMul = tech === "LTE" ? 1 : tech === "NR" ? 3.2 : 2.4;
    const miss = r();
    const day = Math.floor(r() * days);
    pts.push({
      id: `${project.id}-${i}`,
      lat: project.center[1] + dy, lng: project.center[0] + dx,
      operator, tech, service, band, dep, site: `S${dep}-${String(Math.floor(r() * 40)).padStart(3, "0")}`,
      ts: new Date(Date.parse(project.periodStart) + day * 864e5 + r() * 864e5).toISOString(),
      dl: miss < 0.04 ? null : +(Math.max(0.5, (20 + r() * 60) * techMul * bias)).toFixed(1),
      rsrp: miss > 0.97 ? null : +(-118 + r() * 40 * Math.min(1, bias)).toFixed(1),
      sinr: miss > 0.95 ? null : +(-3 + r() * 26 * Math.min(1, bias)).toFixed(1),
      latency: service === "SMS" ? null : +(18 + r() * 40 / bias).toFixed(0),
    });
  }
  pointCache.set(project.id, pts);
  return pts;
}
