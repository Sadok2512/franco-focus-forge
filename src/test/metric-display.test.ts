import { describe, expect, it } from "vitest";
import { metricRadius } from "@/features/kpi/metric-display";

describe("metric display geometry", () => {
  it("keeps the original radii at 50 percent", () => {
    expect(metricRadius(50)).toEqual(["interpolate", ["linear"], ["zoom"], 9, 2, 14, 4, 18, 7]);
  });
  it("enlarges only the selected point and pulses its radius", () => {
    expect(metricRadius(50, true)).toEqual(["interpolate", ["linear"], ["zoom"], 9, 5, 14, 7, 18, 10]);
    expect(metricRadius(50, true, 1)).toEqual(["interpolate", ["linear"], ["zoom"], 9, 7, 14, 9, 18, 12]);
  });
  it("limits presentation size to 0–100 percent", () => {
    expect(metricRadius(200)).toEqual(metricRadius(100));
    expect(metricRadius(-10)).toEqual(metricRadius(0));
  });
});