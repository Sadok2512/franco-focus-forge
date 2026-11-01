// Style d'un graphe de métrique : type de tracé + couleur. Mémorisé par onglet
// de workspace, exactement comme les visualisations (metric-views).
export type MetricPlot = "line" | "bar" | "point";
export type MetricStyle = { plot: MetricPlot; color: string };
export type MetricStyles = Record<string, MetricStyle>;

export const METRIC_PLOTS: MetricPlot[] = ["line", "bar", "point"];

// Palette fixe : une couleur distincte par série, jamais un dégradé.
export const METRIC_COLORS = [
  "#1d4ed8",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0369a1",
  "#4d7c0f",
  "#334155",
];

export const DEFAULT_METRIC_STYLE: MetricStyle = { plot: "line", color: METRIC_COLORS[0]! };

const storageKey = (tabId?: string) =>
  tabId ? `bc3.metrics.styles.${tabId}` : "bc3.metrics.styles";

export function readMetricStyles(tabId?: string): MetricStyles {
  try {
    const raw = localStorage.getItem(storageKey(tabId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const styles: MetricStyles = {};
    for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const style = value as Record<string, unknown>;
      if (
        (style["plot"] === "line" || style["plot"] === "bar" || style["plot"] === "point") &&
        typeof style["color"] === "string"
      ) {
        styles[code] = { plot: style["plot"], color: style["color"] };
      }
    }
    return styles;
  } catch {
    return {};
  }
}

export function writeMetricStyles(tabId: string | undefined, styles: MetricStyles): void {
  try {
    localStorage.setItem(storageKey(tabId), JSON.stringify(styles));
  } catch {
    /* storage refused (private mode) — style stays for this tab session only */
  }
}

export function styleFor(styles: MetricStyles, code: string): MetricStyle {
  return styles[code] ?? DEFAULT_METRIC_STYLE;
}

/** Première couleur de la palette encore libre pour cette carte. */
export function freeColor(used: string[]): string {
  return METRIC_COLORS.find((color) => !used.includes(color)) ?? METRIC_COLORS[0]!;
}
