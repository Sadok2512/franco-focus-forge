import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISTRIBUTION_SETTINGS,
  cdfPoints,
  formatDistributionTick,
  histogramResult,
  histogramRows,
  normalizeDistributionModes,
  percentilePoints,
  quantile,
  toggleDistributionMode,
} from "@/features/kpi/graph-distribution";

describe("metric graph distributions", () => {
  it("builds a CDF without losing repeated observations", () => {
    expect(cdfPoints([3, 1, 2, 2])).toEqual([
      { x: 1, y: 25 },
      { x: 2, y: 75 },
      { x: 3, y: 100 },
    ]);
  });

  it("builds the complete percentile curve without fixed percentile presets", () => {
    const curve = percentilePoints([30, 10, 20]);
    expect(curve).toHaveLength(101);
    expect(curve[0]).toEqual({ x: 10, y: 0 });
    expect(curve[50]).toEqual({ x: 20, y: 50 });
    expect(curve[100]).toEqual({ x: 30, y: 100 });
    expect(curve.every((point, index) => index === 0 || point.x >= curve[index - 1]!.x)).toBe(true);
  });

  it("builds a CCDF as the percentage of values greater than or equal to X", () => {
    expect(cdfPoints([1, 2, 2, 3], "ccdf")).toEqual([
      { x: 1, y: 100 },
      { x: 2, y: 75 },
      { x: 3, y: 25 },
    ]);
  });

  it("uses deterministic R-7 quantiles", () => {
    expect(quantile([10, 20, 30, 40], 50)).toBe(25);
    expect(quantile([10, 20, 30, 40], 90)).toBeCloseTo(37);
  });

  it("keeps selected quantile markers coherent with the cumulative population", () => {
    const values = [-120, -115, -110, -105, -100, -95, -90, -85, -80, -75, -70];
    const cdf = cdfPoints(values);
    for (const percentile of [10, 50, 90]) {
      const value = quantile(values, percentile)!;
      const atOrBelow = values.filter((sample) => sample <= value).length;
      const firstCdfAtOrAbove = cdf.find((point) => point.x >= value)!;
      expect(firstCdfAtOrAbove.y).toBeCloseTo((atOrBelow / values.length) * 100);
    }
  });

  it("preserves every source value in histogram counts", () => {
    const rows = histogramRows([
      { code: "pcell", values: [-90, -88, -88] },
      { code: "scell", values: [-100, -95] },
    ]);
    expect(rows.reduce((sum, row) => sum + (row["pcell"] ?? 0), 0)).toBe(3);
    expect(rows.reduce((sum, row) => sum + (row["scell"] ?? 0), 0)).toBe(2);
  });

  it("reports custom range exclusions and fixed-width bins without losing included samples", () => {
    const result = histogramResult(
      [{ code: "rsrp", values: [-140, -130, -125, -120, -110, -60] }],
      {
        ...DEFAULT_DISTRIBUTION_SETTINGS,
        range: { auto: false, min: -130, max: -60 },
        bins: { mode: "width", width: 10, count: 20 },
      },
    );
    expect(result.population).toMatchObject({
      included: 5,
      excluded: 1,
      binCount: 7,
      binWidth: 10,
    });
    expect(result.rows.reduce((sum, row) => sum + (row["rsrp__count"] ?? 0), 0)).toBe(5);
    expect(result.rows.reduce((sum, row) => sum + (row["rsrp__percentage"] ?? 0), 0)).toBeCloseTo(
      100,
    );
  });

  it("formats RF ticks without floating-point artefacts", () => {
    expect(formatDistributionTick(-129.01250000000002, "dBm", -130, -60)).toBe("-129");
  });

  it("toggles histogram, CDF and percentiles independently", () => {
    expect(normalizeDistributionModes({ histogram: false, cdf: true, percentile: true })).toEqual({
      histogram: false,
      cdf: true,
      percentile: true,
    });
    expect(
      toggleDistributionMode({ histogram: false, cdf: false, percentile: false }, "cdf"),
    ).toEqual({
      histogram: false,
      cdf: true,
      percentile: false,
    });
    expect(
      toggleDistributionMode({ histogram: true, cdf: true, percentile: false }, "percentile"),
    ).toEqual({
      histogram: true,
      cdf: true,
      percentile: true,
    });
    expect(
      toggleDistributionMode({ histogram: true, cdf: true, percentile: true }, "histogram"),
    ).toEqual({ histogram: false, cdf: true, percentile: true });
  });
});
