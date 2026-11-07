import { describe, expect, it } from "vitest";
import { cdfPoints, histogramRows, percentilePoints } from "@/features/kpi/graph-distribution";

describe("metric graph distributions", () => {
  it("builds a CDF without losing repeated observations", () => {
    expect(cdfPoints([3, 1, 2, 2])).toEqual([
      { x: 1, y: 25 },
      { x: 2, y: 75 },
      { x: 3, y: 100 },
    ]);
  });

  it("builds the complete percentile curve without fixed percentile presets", () => {
    expect(percentilePoints([30, 10, 20])).toEqual([
      { x: 0, y: 10 },
      { x: 50, y: 20 },
      { x: 100, y: 30 },
    ]);
  });

  it("preserves every source value in histogram counts", () => {
    const rows = histogramRows([
      { code: "pcell", values: [-90, -88, -88] },
      { code: "scell", values: [-100, -95] },
    ]);
    expect(rows.reduce((sum, row) => sum + (row["pcell"] ?? 0), 0)).toBe(3);
    expect(rows.reduce((sum, row) => sum + (row["scell"] ?? 0), 0)).toBe(2);
  });
});
