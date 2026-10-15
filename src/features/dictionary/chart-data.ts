import type { ParamRow } from "@/lib/api/dictionary-schemas";
import { groupDistribution, measureOf, type GroupBy, type Grouped, type Measure } from "./grouping";

export type ChartType = "grouped" | "stacked" | "stacked100";
export type ColorBy = "value" | "band" | "operator";
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  grouped: "Barres", stacked: "Barres empilées", stacked100: "Barres empilées 100 %",
};
export const COLOR_LABELS: Record<ColorBy, string> = { value: "Valeur", band: "Bande", operator: "Opérateur" };

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
