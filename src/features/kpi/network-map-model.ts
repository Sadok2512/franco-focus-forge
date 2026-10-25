/** Pure helpers for the shared premium network map chrome (Map page + Signaling View). */
import { getGeorefBandColor } from "./georef-cell-geometry";

/** GEOREF display bands mapped to the /sites `band` query codes. */
export const NETWORK_BANDS = [
  { key: "NR3500", code: "n78", tech: "NR" },
  { key: "NR700", code: "n28", tech: "NR" },
  { key: "NR2100", code: "n1", tech: "NR" },
  { key: "L2600", code: "B7", tech: "LTE" },
  { key: "L2100", code: "B1", tech: "LTE" },
  { key: "L1800", code: "B3", tech: "LTE" },
  { key: "L800", code: "B20", tech: "LTE" },
  { key: "L700", code: "B28", tech: "LTE" },
] as const;

export const BAND_CODES = NETWORK_BANDS.map((b) => b.code);
export const TECHNO_CODES = ["4G", "5G", "LTE"];
export const NR_COLOR = getGeorefBandColor("", "NR");
export const LTE_COLOR = getGeorefBandColor("", "LTE");

export const bandColor = (key: string) => getGeorefBandColor(key, key.startsWith("NR") ? "NR" : "LTE");

/** Filters use "empty = all". Toggle `values` inside `universe` without ever
 * reaching an empty "nothing" state (the last active group cannot be removed). */
export function toggleWithin(selected: string[], values: string[], universe: string[]): string[] {
  const active = selected.length ? selected : universe;
  const allOn = values.every((v) => active.includes(v));
  const next = allOn ? active.filter((v) => !values.includes(v)) : [...new Set([...active, ...values])];
  if (!next.length) return selected;
  return universe.every((v) => next.includes(v)) ? [] : universe.filter((v) => next.includes(v));
}

export const isActive = (selected: string[], values: string[]) =>
  selected.length === 0 || values.every((v) => selected.includes(v));

const EARTH = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}

export const pathLength = (pts: Array<[number, number]>) =>
  pts.slice(1).reduce((sum, p, i) => sum + haversine(pts[i]!, p), 0);

/** Spherical polygon area (m²). */
export function polygonArea(pts: Array<[number, number]>): number {
  if (pts.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [l1, p1] = pts[i]!;
    const [l2, p2] = pts[(i + 1) % pts.length]!;
    total += rad(l2 - l1) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
  }
  return Math.abs((total * EARTH * EARTH) / 2);
}

export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
export const formatArea = (m2: number) => (m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2)} km²` : `${Math.round(m2)} m²`);

/** Scale bar for a MapLibre (512 px tiles) zoom at a latitude. */
export function scaleBar(zoom: number, lat: number, maxPx = 90): { label: string; px: number } {
  const mpp = (40075016.686 * Math.cos(rad(lat))) / (512 * 2 ** zoom);
  const raw = mpp * maxPx;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const nice = [5, 2, 1].map((f) => f * pow).find((v) => v <= raw) ?? pow;
  return { label: formatDistance(nice), px: Math.round(nice / mpp) };
}

export type SearchableFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown>;
};
export type SearchHit = { id: string; title: string; subtitle: string; center: [number, number]; kind: "site" | "cell" | "coords" };

const SEARCH_FIELDS = ["site_name", "site_id", "cell_name", "cell_id", "ecgi", "ncgi", "pci", "earfcn", "nrarfcn", "arfcn", "band"];

/** Searches only features already returned by /sites for the visible area. */
export function searchNetwork(query: string, sites: SearchableFeature[], cells: SearchableFeature[], limit = 8): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const coords = q.split(/[;,\s]+/).filter(Boolean).map(Number);
  const hits: SearchHit[] = [];
  if (coords.length === 2 && coords.every(Number.isFinite) && Math.abs(coords[0]!) <= 90 && Math.abs(coords[1]!) <= 180)
    hits.push({ id: "coords", kind: "coords", title: `${coords[0]}, ${coords[1]}`, subtitle: "", center: [coords[1]!, coords[0]!] });
  const scan = (list: SearchableFeature[], kind: "site" | "cell") => {
    for (const f of list) {
      if (hits.length >= limit) return;
      const p = f.properties;
      if (p["kind"] === "cluster") continue;
      const match = SEARCH_FIELDS.find((k) => p[k] != null && String(p[k]).toLowerCase().includes(q));
      if (!match) continue;
      const title = String(p[kind === "site" ? "site_name" : "cell_name"] ?? p["site_name"] ?? p["site_id"] ?? "—");
      const subtitle = [p["site_id"], p["band"], p["pci"] != null ? `PCI ${p["pci"]}` : null].filter((v) => v != null && v !== "").join(" · ");
      hits.push({ id: `${kind}-${String(p["cell_id"] ?? p["site_id"] ?? hits.length)}-${hits.length}`, kind, title, subtitle, center: f.geometry.coordinates });
    }
  };
  scan(sites, "site");
  scan(cells, "cell");
  return hits;
}
