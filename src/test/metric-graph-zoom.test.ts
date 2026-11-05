import { describe, expect, it } from "vitest";
import {
  metricZoomDomain,
  metricZoomStorageKey,
  normalizeMetricZoom,
} from "@/features/kpi/MetricGraphCard";

describe("Metric graph temporal zoom", () => {
  const rows = [0, 2.5, 5, 12, 20].map((t_rel_s) => ({ t_rel_s }));

  it("turns the selected brush indexes into the visible X-axis domain", () => {
    expect(metricZoomDomain(rows, null)).toEqual([0, 20]);
    expect(metricZoomDomain(rows, { startIndex: 1, endIndex: 3 })).toEqual([2.5, 12]);
  });

  it("clamps invalid bounds and represents the full range as reset", () => {
    expect(normalizeMetricZoom({ startIndex: -10, endIndex: 99 }, rows.length)).toBeNull();
    expect(normalizeMetricZoom({ startIndex: 3, endIndex: 1 }, rows.length)).toEqual({
      startIndex: 3,
      endIndex: 3,
    });
    expect(metricZoomDomain(rows, { startIndex: 4, endIndex: 4 })).toEqual([20, 21]);
  });

  it("isolates persisted zoom by workspace and panel", () => {
    expect(metricZoomStorageKey("workspace-a", "graph-1")).toBe(
      "bc4.metric-zoom.v1.workspace-a.graph-1",
    );
    expect(metricZoomStorageKey("workspace-a", "graph-2")).not.toBe(
      metricZoomStorageKey("workspace-a", "graph-1"),
    );
    expect(metricZoomStorageKey("workspace-b", "graph-1")).not.toBe(
      metricZoomStorageKey("workspace-a", "graph-1"),
    );
  });
});
