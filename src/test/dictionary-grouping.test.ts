import { describe, expect, it } from "vitest";
import { getDictParams, getDictTree } from "@/lib/api/dictionary";
import { groupDistribution, measureOf } from "@/features/dictionary/grouping";
import { chartDistribution, chartMeasure } from "@/features/dictionary/chart-data";

async function firstRow() {
  const tree = await getDictTree("idf-t3-2026", {});
  const lte = tree.branches.find((b) => b.system === "LTE")!;
  const msg = lte.messages.find((m) => m.count > 0)!;
  const list = await getDictParams("idf-t3-2026", "LTE", msg.message, {});
  return list.params.find((p) => p.count > 0)!;
}

describe("Dictionnaire RRC — regroupement (G6)", () => {
  it("coloring by band or operator preserves observations and splits the requested dimension", async () => {
    const row = await firstRow();
    for (const colorBy of ["value", "band", "operator"] as const) {
      const chart = chartDistribution(row, "none", colorBy);
      expect(chart.population).toBe(row.count);
      expect(chart.series.reduce((sum, s) => sum + s.total, 0)).toBe(row.count);
      if (colorBy === "band") expect(chart.series.map((s) => s.band).sort()).toEqual([...new Set(row.value_matrix?.map((cell) => cell.band))].sort());
      if (colorBy === "operator") expect(chart.series.map((s) => s.operator).sort()).toEqual([...new Set(row.value_matrix?.map((cell) => cell.operator))].sort());
    }
  });

  it("100% stacked columns total 100 while ordinary bars retain counts", () => {
    const series = [{ key: "Orange", counts: [25], total: 25 }, { key: "SFR", counts: [75], total: 75 }];
    expect(chartMeasure(25, 0, series, "stacked100", "count", 100, 25)).toBe(25);
    expect(series.reduce((sum, s) => sum + (chartMeasure(s.counts[0] ?? 0, 0, series, "stacked100", "count", 100, s.total) ?? 0), 0)).toBe(100);
    expect(chartMeasure(75, 0, series, "grouped", "count", 100, 75)).toBe(75);
    expect(chartMeasure(75, 0, series, "stacked", "count", 100, 75)).toBe(75);
    expect(chartMeasure(0, 1, series, "stacked100", "count", 100, 75)).toBeNull();
  });

  it("each grouping mode reconciles to the API total", async () => {
    const row = await firstRow();
    for (const mode of ["none", "operator", "band", "operator_band"] as const) {
      const g = groupDistribution(row, mode);
      expect(g.population).toBe(row.count);
      const seriesSum = g.series.reduce((a, s) => a + s.total, 0);
      expect(seriesSum).toBe(row.count);
      g.bins.forEach((b, i) => {
        expect(g.series.reduce((a, s) => a + s.counts[i]!, 0)).toBe(b.total);
      });
    }
  });

  it("operator grouping yields one series per observed operator", async () => {
    const row = await firstRow();
    const ops = new Set(row.buckets.map((b) => b.operator));
    expect(groupDistribution(row, "operator").series.map((s) => s.key).sort()).toEqual([...ops].sort());
    expect(groupDistribution(row, "none").series).toHaveLength(1);
  });

  it("falls back to totals when the API omits value_matrix", async () => {
    const row = { ...(await firstRow()), value_matrix: undefined };
    const g = groupDistribution(row, "operator");
    expect(g.groupingSupported).toBe(false);
    expect(g.series).toHaveLength(1);
    expect(g.population).toBe(row.count);
  });

  it("percentages use the declared denominator and never invent zero", () => {
    expect(measureOf(25, "pct_total", 200, 50)).toBe(12.5);
    expect(measureOf(25, "pct_group", 200, 50)).toBe(50);
    expect(measureOf(5, "pct_group", 200, 0)).toBeNull();
  });
});
