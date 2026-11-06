import { describe, expect, it } from "vitest";
import {
  metricSeriesPlotPoints,
  metricSeriesRenderMode,
  metricTimelineRows,
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

describe("Metric graph independent overlay series", () => {
  const pcell = [
    { seq: 10, t_rel_s: 1, value: 4 },
    { seq: 30, t_rel_s: 3, value: 8 },
  ];
  const scell = [
    { seq: 20, t_rel_s: 2, value: 2 },
    { seq: 40, t_rel_s: 4, value: 6 },
  ];

  it("does not inject the other KPI samples as nulls into either line", () => {
    expect(metricSeriesPlotPoints(pcell, "line")).toEqual(pcell);
    expect(metricSeriesPlotPoints(scell, "line")).toEqual(scell);
    expect(
      metricTimelineRows([
        { code: "pdsch@pcell", points: pcell },
        { code: "pdsch@scell1", points: scell },
      ]).map((row) => row.t_rel_s),
    ).toEqual([1, 2, 3, 4]);
  });

  it("uses points for duplicate timestamps instead of drawing a vertical segment", () => {
    expect(
      metricSeriesRenderMode("line", [
        { seq: 1, t_rel_s: 1, value: 10 },
        { seq: 2, t_rel_s: 1, value: 20 },
      ]),
    ).toBe("point");
  });

  it("keeps source samples and inserts only a null break across a real gap", () => {
    const source = [
      { seq: 1, t_rel_s: 0, value: 1 },
      { seq: 2, t_rel_s: 1, value: 2 },
      { seq: 3, t_rel_s: 2, value: 3 },
      { seq: 4, t_rel_s: 50, value: 4 },
    ];
    const plotted = metricSeriesPlotPoints(source, "line");
    expect(plotted.filter((point) => point.value !== null)).toEqual(source);
    expect(plotted.filter((point) => point.value === null)).toHaveLength(1);
  });
});
