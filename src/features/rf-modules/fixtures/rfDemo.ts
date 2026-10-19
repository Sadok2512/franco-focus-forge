// -----------------------------------------------------------------------
// 1.20.2 — Fixtures RF Modules **DÉMO** (observations fictives).
//
// Discipline (règles §2 §7 §11 BC4) :
// - Données déterministes (seedées) — aucun Math.random() sur render.
// - Aucune identité d'abonné (pas d'IMSI/IMEI). `obs_id` = token court
//   anonyme déterministe.
// - Coordonnées fictives autour d'un point de démo (La Défense) —
//   JAMAIS un vrai site opérateur. Les ids `demo-ecgi-*` sont des
//   placeholders ; ils ne correspondent à aucune vraie cellule.
// - Toute carte / histogramme / table dérive de CES records uniquement.
// - La bannière "MODE DÉMO — Données fictives" est obligatoire côté UI.
// -----------------------------------------------------------------------

export type DemoObservation = {
  obs_id: string;            // anonyme, token court
  capture_id: string;
  seq: number;
  operator: "Orange" | "SFR" | "Bouygues" | "Free";
  technology: "LTE" | "NR" | "EN-DC";
  band: string;
  vendor: "Nokia" | "Ericsson" | "Huawei" | "N/D";
  zone: string;              // zone fictive de démo
  serving_cell: string;
  candidate_cell: string;
  serving_rsrp_dbm: number;
  candidate_rsrp_dbm: number;
  margin_db: number;         // candidate - serving
  serving_position: { lat: number; lng: number };
  candidate_position: { lat: number; lng: number };
  ue_observation_position: { lat: number; lng: number };
  candidate_evidence: boolean;      // paire serving/neighbor existe
  confirmation_evidence: boolean;   // critère secondaire (distance/temps) OK
  classification: "BETTER_CELL_CANDIDATE" | "OVERSHOOTING_CONFIRMED" | "INSUFFICIENT_EVIDENCE";
  fixture_version: string;
};

// Centre démo : La Défense (approximatif, FICTIF pour la démo).
const CENTER = { lat: 48.8921, lng: 2.2379 };

// Petit générateur pseudo-aléatoire déterministe (seed stable).
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function obsId(i: number): string {
  // Déterministe, non-réversible, aucune identité réelle.
  return `obs-${(0xa17b4 + i * 97).toString(16).slice(-6)}`;
}

const OP_LIST = ["Orange", "SFR", "Bouygues", "Free"] as const;
const BAND_LTE = ["B1", "B3", "B7", "B20", "B28"];
const BAND_NR = ["n78", "n1", "n28"];
const VENDOR_LIST = ["Nokia", "Ericsson", "Huawei", "N/D"] as const;
const ZONE_LIST = ["Démo-Zone-Nord", "Démo-Zone-Centre", "Démo-Zone-Sud"];

// 7 cellules serveuses "demo-ecgi-*" distinctes + 7 candidats distincts →
// permet un histogram Top N significatif.
const SERVING_POOL = Array.from({ length: 7 }).map((_, i) => `demo-ecgi-serv-${(i + 1).toString().padStart(2, "0")}`);
const CANDIDATE_POOL = Array.from({ length: 7 }).map((_, i) => `demo-ecgi-cand-${(i + 1).toString().padStart(2, "0")}`);

function siteOffset(i: number): { lat: number; lng: number } {
  // Grille déterministe autour du centre, pas aléatoire chaque render.
  const r = rng(1000 + i * 31);
  const dLat = (r() - 0.5) * 0.012;
  const dLng = (r() - 0.5) * 0.018;
  return { lat: CENTER.lat + dLat, lng: CENTER.lng + dLng };
}

export const DEMO_FIXTURE_VERSION = "rf-demo-overshooting@2026-10-17";

export function buildOvershootingDemo(): DemoObservation[] {
  const rand = rng(42);
  const out: DemoObservation[] = [];
  // 42 observations déterministes : 7 serving × ~6 observations chacune
  for (let i = 0; i < 42; i++) {
    const servingIdx = i % 7;
    const candidateIdx = (i + 2 + Math.floor(i / 7)) % 7;
    const serving = SERVING_POOL[servingIdx]!;
    const candidate = CANDIDATE_POOL[candidateIdx]!;
    const servingPos = siteOffset(servingIdx);
    const candidatePos = siteOffset(100 + candidateIdx);
    // UE observation entre les 2
    const ueR = rand();
    const ue = {
      lat: servingPos.lat + (candidatePos.lat - servingPos.lat) * (0.3 + ueR * 0.4),
      lng: servingPos.lng + (candidatePos.lng - servingPos.lng) * (0.3 + ueR * 0.4),
    };
    const servingRsrp = -108 - Math.round(rand() * 8);
    const margin = 2 + Math.round(rand() * 15);
    const candidateRsrp = servingRsrp + margin;
    const op = OP_LIST[i % 4]!;
    const tech = i % 5 === 0 ? "NR" : i % 7 === 0 ? "EN-DC" : "LTE";
    const band = tech === "NR" ? BAND_NR[i % BAND_NR.length]! : BAND_LTE[i % BAND_LTE.length]!;
    const vendor = VENDOR_LIST[i % 4]!;
    const zone = ZONE_LIST[servingIdx % ZONE_LIST.length]!;
    // Classification déterministe :
    // - margin ≥ 10 ET confirmation_evidence (1 sur 3 des gros écarts) → OVERSHOOTING_CONFIRMED
    // - margin ≥ 3 ET candidate_evidence → BETTER_CELL_CANDIDATE
    // - sinon INSUFFICIENT_EVIDENCE
    const confirmation = margin >= 10 && (i % 3 === 0);
    const candEvid = margin >= 3;
    const classification: DemoObservation["classification"] = confirmation
      ? "OVERSHOOTING_CONFIRMED"
      : candEvid
        ? "BETTER_CELL_CANDIDATE"
        : "INSUFFICIENT_EVIDENCE";
    out.push({
      obs_id: obsId(i),
      capture_id: `demo-cap-${String.fromCharCode(97 + (i % 5))}`,
      seq: 1000 + i * 17,
      operator: op,
      technology: tech as DemoObservation["technology"],
      band,
      vendor,
      zone,
      serving_cell: serving,
      candidate_cell: candidate,
      serving_rsrp_dbm: servingRsrp,
      candidate_rsrp_dbm: candidateRsrp,
      margin_db: margin,
      serving_position: servingPos,
      candidate_position: candidatePos,
      ue_observation_position: ue,
      candidate_evidence: candEvid,
      confirmation_evidence: confirmation,
      classification,
      fixture_version: DEMO_FIXTURE_VERSION,
    });
  }
  return out;
}

export const RF_DEMO_FIXTURE: readonly DemoObservation[] = buildOvershootingDemo();

// Bounds pour centrage de la carte démo.
export const DEMO_BOUNDS = (() => {
  const lats = RF_DEMO_FIXTURE.flatMap((o) => [o.serving_position.lat, o.candidate_position.lat, o.ue_observation_position.lat]);
  const lngs = RF_DEMO_FIXTURE.flatMap((o) => [o.serving_position.lng, o.candidate_position.lng, o.ue_observation_position.lng]);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
})();

export function filterDemo(
  obs: readonly DemoObservation[],
  filters: {
    operator: string[];
    techno: string[];
    band: string[];
    zone: string[];
    vendor: string[];
  },
): readonly DemoObservation[] {
  return obs.filter((o) => {
    if (filters.operator.length && !filters.operator.includes(o.operator)) return false;
    if (filters.techno.length && !filters.techno.includes(o.technology)) return false;
    if (filters.band.length && !filters.band.includes(o.band)) return false;
    if (filters.zone.length && !filters.zone.includes(o.zone)) return false;
    if (filters.vendor.length && !filters.vendor.includes(o.vendor)) return false;
    return true;
  });
}

export function medianMargin(obs: readonly DemoObservation[]): number | null {
  if (obs.length === 0) return null;
  const sorted = [...obs].map((o) => o.margin_db).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function topServing(obs: readonly DemoObservation[], n: number): Array<{ serving: string; count: number }> {
  const byServing = new Map<string, number>();
  for (const o of obs) {
    byServing.set(o.serving_cell, (byServing.get(o.serving_cell) ?? 0) + 1);
  }
  return Array.from(byServing.entries())
    .map(([serving, count]) => ({ serving, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
