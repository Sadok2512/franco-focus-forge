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
    id: "idf-t3-2026", name: "Paris 2026 Q1", geography: "Île-de-France (Paris + Petite Couronne)",
    center: [2.35, 48.86], operators: ["Orange", "SFR", "Bouygues", "Free"], technologies: ["LTE", "NR", "EN-DC"],
    services: ["Data", "SMS", "Voice"], bands: ["B3", "B7", "B20", "n78"], departements: ["75", "92", "93", "94"],
    periodStart: "2026-01-01", periodEnd: "2026-03-31", captures: 2400000, importedAt: "2026-04-02", status: "ready",
  },
  {
    id: "lyon-drive-2026", name: "Lyon Métropole", geography: "Auvergne-Rhône-Alpes",
    center: [4.84, 45.76], operators: ["Orange", "SFR"], technologies: ["LTE", "NR"],
    services: ["Data", "Voice"], bands: ["B3", "B20", "n78"], departements: ["69"],
    periodStart: "2026-02-01", periodEnd: "2026-02-28", captures: 850000, importedAt: "2026-03-02", status: "ready",
  },
  {
    id: "marseille-5g-2026", name: "Marseille 5G", geography: "PACA",
    center: [5.37, 43.296], operators: ["Orange", "Bouygues", "Free"], technologies: ["NR"],
    services: ["Data"], bands: ["n78", "n28"], departements: ["13"],
    periodStart: "2026-01-01", periodEnd: "2026-01-31", captures: 1200000, importedAt: "2026-02-03", status: "ready",
  },
  {
    id: "lille-indoor-2026", name: "Tests Indoor", geography: "Bâtiment Orange Village",
    center: [2.24, 48.83], operators: ["Orange"], technologies: ["LTE"],
    services: ["Data"], bands: ["B3", "B7"], departements: ["92"],
    periodStart: "2026-01-10", periodEnd: "2026-01-20", captures: 320000, importedAt: "2026-01-22", status: "processing",
  },
  {
    id: "national-2026", name: "Benchmark National", geography: "France entière",
    center: [2.35, 46.8], operators: ["Orange", "SFR", "Bouygues", "Free"], technologies: ["LTE", "NR"],
    services: ["Data", "Voice"], bands: ["B3", "B20", "n78"], departements: ["75", "69", "13", "33", "59"],
    periodStart: "2026-01-01", periodEnd: "2026-03-31", captures: 5800000, importedAt: "2026-04-05", status: "ready",
  },
];

const pick = <T,>(arr: readonly T[], r: () => number): T => arr[Math.floor(r() * arr.length)] as T;

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
    const operator = pick(project.operators, r);
    const tech: Tech = pick(project.technologies, r);
    const service: Service = pick(project.services, r);
    const nrBands = project.bands.filter((b) => b.startsWith("n"));
    const lteBands = project.bands.filter((b) => !b.startsWith("n"));
    const pool = tech === "LTE" ? lteBands : nrBands.length ? nrBands : lteBands;
    const band = pick(pool, r);
    const dep = pick(project.departements, r);
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


/* ---------- Dictionnaire RRC (démo) ---------- */
export type RrcNode = { id: string; label: string; children?: RrcNode[] };
export const RRC_TREE: RrcNode[] = [
  { id: "lte", label: "LTE", children: [
    { id: "lte-ul", label: "UL-CCCH", children: [
      { id: "rrcreq", label: "RRCConnectionRequest", children: [
        { id: "crit", label: "criticalExtensions", children: [
          { id: "r8", label: "rrcConnectionRequest-r8", children: [
            { id: "establishmentCause", label: "establishmentCause" },
            { id: "spare", label: "spare" },
            { id: "ue-Identity", label: "ue-Identity" },
            { id: "dedicatedInfoNAS", label: "dedicatedInfoNAS" },
          ] },
        ] },
      ] },
      { id: "rrcsetup", label: "RRCConnectionSetup" },
      { id: "rrccomplete", label: "RRCConnectionSetupComplete" },
      { id: "rrcreconf", label: "RRCConnectionReconfiguration" },
    ] },
  ] },
  { id: "nr", label: "NR", children: [
    { id: "nr-ul", label: "UL-CCCH" },
    { id: "nr-dl", label: "DL-DCCH" },
    { id: "nr-reconf", label: "RRCReconfiguration" },
  ] },
];
export const RRC_FIELD = {
  id: "establishmentCause", name: "establishmentCause", tech: "LTE",
  description: "Cause de l'établissement de la connexion RRC.",
  message: "RRCConnectionRequest",
  path: "criticalExtensions > rrcConnectionRequest-r8 > establishmentCause",
  type: "ENUMERATED",
  values: "Valeurs possibles : mo-Signalling, mo-Data, highPriorityAccess…",
  dominant: "mo-Data (54,2 %)", occurrences: 1324523, unresolvedPct: 0.8,
  distribution: [
    { value: "mo-Data", pct: 54.2, byOp: { Orange: 52.1, SFR: 56.3, Bouygues: 54.8, Free: 53.6 } },
    { value: "mo-Signalling", pct: 28.1, byOp: { Orange: 29.4, SFR: 24.1, Bouygues: 27.8, Free: 29.1 } },
    { value: "emergency", pct: 8.4, byOp: { Orange: 8.1, SFR: 8.7, Bouygues: 8.2, Free: 8.6 } },
    { value: "highPriorityAccess", pct: 6.1, byOp: { Orange: 6.3, SFR: 5.8, Bouygues: 6.4, Free: 5.9 } },
    { value: "autres", pct: 3.2, byOp: { Orange: 4.1, SFR: 3.1, Bouygues: 2.8, Free: 2.8 } },
  ],
};

/* ---------- Catalogue KPI (démo) ---------- */
export const KPI_CATALOG = [
  { group: "Accessibilité", items: ["RRC Success Rate", "RRC Setup Time", "Initial Attach Success"] },
  { group: "Rétention", items: ["Drop Call Rate", "RRC Abnormal Release"] },
  { group: "Mobilité", items: ["HO Success Rate", "HO Interruption Time"] },
  { group: "Débit", items: ["Throughput DL", "Throughput UL"] },
  { group: "Qualité radio", items: ["RSRP moyen", "SINR moyen"] },
  { group: "Voix", items: ["VoLTE Setup Success", "MOS"] },
  { group: "NR / EN-DC", items: ["SgNB Addition Success", "EN-DC Ratio"] },
];
export const KPI_RRC = {
  name: "RRC Success Rate", description: "Taux de succès de l'établissement d'une connexion RRC.",
  value: 98.2, delta: 0.3, samples: 2400000, techs: "LTE, NR", unit: "%",
  byOp: { Orange: 98.5, SFR: 97.8, Bouygues: 98.1, Free: 97.9 } as Record<Operator, number>,
};

/* ---------- Assistant IA (démo) ---------- */
export const CONVERSATIONS = [
  { id: "c1", title: "Comparaison NR Orange vs SFR", date: "Aujourd'hui, 10:24" },
  { id: "c2", title: "Analyse EN-DC par bande", date: "Hier, 16:15" },
  { id: "c3", title: "Paramètres RRC différents", date: "12/05/2026" },
  { id: "c4", title: "Zones faible SINR", date: "10/05/2026" },
  { id: "c5", title: "Débits UL les plus faibles", date: "08/05/2026" },
];
export const SUGGESTIONS = [
  "Compare les débits NR entre Orange et SFR",
  "Quels paramètres RRC diffèrent ?",
  "Montre les zones avec un faible SINR",
  "Analyse les performances EN-DC",
];
export const ASSISTANT_ANSWER = {
  question: "Compare les débits NR entre Orange et SFR sur Paris.",
  intro: "Voici la comparaison des débits NR entre Orange et SFR sur Paris, basée sur les mesures disponibles dans votre projet.",
  box: { Orange: [40, 120, 245, 420, 560], SFR: [30, 90, 180, 300, 700] } as Record<string, number[]>,
  stats: [
    { m: "P10", o: "85", s: "62" }, { m: "P50", o: "245", s: "180" }, { m: "P90", o: "520", s: "410" },
    { m: "Moyenne", o: "268", s: "195" }, { m: "Échantillons", o: "412 564", s: "298 761" },
  ],
  analysis: "Orange présente un débit NR médian supérieur de +36 % par rapport à SFR sur Paris, avec une meilleure stabilité (P90 plus élevé).",
};
