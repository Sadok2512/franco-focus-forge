import type { ParamRow } from "@/lib/api/dictionary-schemas";
import { groupDistribution, measureOf, type GroupBy, type Grouped, type Measure } from "./grouping";

export type ChartType = "grouped" | "stacked" | "stacked100";
export type ColorBy = "value" | "band" | "operator";
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  grouped: "Barres", stacked: "Barres empilées", stacked100: "Barres empilées 100 %",
};
export const COLOR_LABELS: Record<ColorBy, string> = { value: "Valeur", band: "Bande", operator: "Opérateur" };

export function colorKey(g: Grouped, colorBy: ColorBy, series: Grouped["series"][number], index: number) {
  return colorBy === "value" ? (g.bins[index]?.raw ?? "")
    : colorBy === "band" ? (series.band ?? series.key) : (series.operator ?? series.key);
}

/** One semantic token mapping shared by chart marks and table swatches. */
export function colorToken(g: Grouped, colorBy: ColorBy, series: Grouped["series"][number], index: number) {
  const key = colorKey(g, colorBy, series, index);
  const operators: Record<string, string> = { Orange: "--op-orange", SFR: "--op-sfr", Bouygues: "--op-bouygues", Free: "--op-free" };
  if (colorBy === "operator" && operators[key]) return operators[key];
  const keys = colorBy === "value" ? g.bins.map((bin) => bin.raw)
    : [...new Set(g.series.map((item) => colorKey(g, colorBy, item, 0)))].sort();
  return `--chart-${Math.max(0, keys.indexOf(key)) % 5 + 1}`;
}

export function filterDistribution(g: Grouped, query: string, colorBy: ColorBy, hidden: string[]): Grouped {
  const indices = g.bins.flatMap((bin, i) =>
    `${bin.label} ${bin.raw}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    !(colorBy === "value" && hidden.includes(bin.raw)) ? [i] : []);
  const series = g.series.filter((s) => colorBy === "value" || !hidden.includes(colorKey(g, colorBy, s, 0)))
    .map((s) => {
      const counts = indices.map((i) => s.counts[i] ?? 0);
      return { ...s, counts, total: counts.reduce((sum, n) => sum + n, 0) };
    });
  const bins = indices.map((i, j) => ({ ...g.bins[i], total: series.reduce((sum, s) => sum + (s.counts[j] ?? 0), 0) }));
  return { ...g, bins, series, population: bins.reduce((sum, bin) => sum + bin.total, 0) };
}

/** Refine groups by the color dimension without changing observed totals. */
export function chartDistribution(row: ParamRow, groupBy: GroupBy, colorBy: ColorBy): Grouped {
  const effective = colorBy === "value" ? groupBy
    : groupBy === "operator_band" || (groupBy !== "none" && groupBy !== colorBy)
      ? "operator_band" : colorBy;
  return groupDistribution(row, effective);
}

export function chartMeasure(count: number, binIndex: number, series: Grouped["series"], chartType: ChartType, measure: Measure, population: number, groupTotal: number) {
  if (chartType !== "stacked100") return measureOf(count, measure, population, groupTotal);
  const total = series.reduce((sum, item) => sum + (item.counts[binIndex] ?? 0), 0);
  return total > 0 ? count / total * 100 : null;
}
