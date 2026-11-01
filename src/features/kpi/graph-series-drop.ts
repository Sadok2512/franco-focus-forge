// Séries ajoutées à un graphe par glisser-déposer. Mémorisées par onglet et
// par carte de base : le dépôt n'ajoute rien au workspace, au tableau ni aux
// autres cartes.
import { METRIC_COLORS, freeColor } from "./metric-styles";

export type GraphSeries = { code: string; label: string; unit: string; color: string };

const storageKey = (tabId: string | undefined, base: string) =>
  `bc4.graph.series.${tabId ?? "default"}.${base}`;

export function readGraphSeries(tabId: string | undefined, base: string): GraphSeries[] {
  try {
    const raw = localStorage.getItem(storageKey(tabId, base));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.reduce<GraphSeries[]>((all, item) => {
      if (!item || typeof item !== "object") return all;
      const value = item as Record<string, unknown>;
      if (
        typeof value["code"] === "string" &&
        value["code"].trim() &&
        typeof value["label"] === "string" &&
        typeof value["unit"] === "string" &&
        typeof value["color"] === "string"
      ) {
        all.push({
          code: value["code"],
          label: value["label"],
          unit: value["unit"],
          color: value["color"],
        });
      }
      return all;
    }, []);
  } catch {
    return [];
  }
}

export function writeGraphSeries(
  tabId: string | undefined,
  base: string,
  series: GraphSeries[],
): void {
  try {
    localStorage.setItem(storageKey(tabId, base), JSON.stringify(series));
  } catch {
    /* storage refused (private mode) — series stay for this tab session only */
  }
}

// Unités synonymes : mêmes grandeurs physiques, même axe. Les autres grandeurs
// (dB vs dBm, % vs dB, ms vs s) ne sont JAMAIS fusionnées.
const UNIT_SYNONYMS: Record<string, string> = {
  "mbit/s": "mbps",
  mbit: "mbps",
  "kbit/s": "kbps",
  kbit: "kbps",
  "bit/s": "bps",
  "bits/s": "bps",
  percent: "%",
  pct: "%",
  sec: "s",
  seconds: "s",
};

export function normalizeUnit(unit: string): string {
  const raw = (unit || "").trim().toLowerCase().replace(/\s+/g, "");
  return UNIT_SYNONYMS[raw] ?? raw;
}

/** Axe d'une unité dans une carte : la 1re unité occupe l'axe gauche, la 2e
 * l'axe droit. Une 3e unité n'a pas d'axe valide → null (séparée, jamais une
 * échelle fausse). */
export function axisOf(units: string[], unit: string): "left" | "right" | null {
  const seen: string[] = [];
  for (const value of [...units, unit]) {
    const normalized = normalizeUnit(value);
    if (!seen.includes(normalized)) seen.push(normalized);
  }
  const index = seen.indexOf(normalizeUnit(unit));
  return index === 0 ? "left" : index === 1 ? "right" : null;
}

export type DropResult =
  | { ok: true; series: GraphSeries[] }
  | { ok: false; reason: "duplicate" | "axis" };

/** Ajoute une métrique déposée à la carte : jamais la carte elle-même, jamais
 * deux fois la même, jamais une 3e unité. */
export function addGraphSeries(
  current: GraphSeries[],
  added: { code: string; label: string; unit: string },
  base: { code: string; unit: string },
): DropResult {
  if (added.code === base.code || current.some((s) => s.code === added.code))
    return { ok: false, reason: "duplicate" };
  if (axisOf([base.unit, ...current.map((s) => s.unit)], added.unit) === null)
    return { ok: false, reason: "axis" };
  return {
    ok: true,
    series: [
      ...current,
      { ...added, color: freeColor([METRIC_COLORS[0]!, ...current.map((s) => s.color)]) },
    ],
  };
}
