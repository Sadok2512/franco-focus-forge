import { beforeEach, describe, expect, it } from "vitest";
import {
  addManagedSeries,
  canAssignSeriesAxis,
  graphSeriesSettingsKey,
  graphAxisDomain,
  GRAPH_LINE_MARKERS,
  initialGraphSeriesSettings,
  readGraphSeriesSettings,
  reorderManagedSeries,
  writeGraphSeriesSettings,
} from "@/features/kpi/graph-series-management";

describe("graph series management", () => {
  beforeEach(() => localStorage.clear());

  const base = {
    code: "pdsch_throughput@lte-type-0",
    label: "PDSCH throughput · PCell",
    unit: "Mbit/s",
    color: "#2563eb",
  };

  it("keeps Line free of persistent and hover points", () => {
    expect(GRAPH_LINE_MARKERS).toEqual({ dot: false, activeDot: false });
  });

  it("assigns compatible throughput to left and BLER to right", () => {
    let settings = initialGraphSeriesSettings(base, [], []);
    settings = addManagedSeries(settings, {
      code: "nr_bler@nr-type-199",
      label: "NR BLER · PSCell",
      unit: "%",
    })!;
    settings = addManagedSeries(settings, {
      code: "nr_thp@nr-type-199",
      label: "NR throughput · PSCell",
      unit: "Mbit/s",
    })!;
    expect(settings.series.map(({ code, axis }) => [code, axis])).toEqual([
      [base.code, "left"],
      ["nr_bler@nr-type-199", "right"],
      ["nr_thp@nr-type-199", "left"],
    ]);
    expect(settings.series.every((item) => item.display === "point")).toBe(true);
    expect(new Set(settings.series.map((item) => item.color)).size).toBe(3);
  });

  it("rejects a third incompatible unit and an incompatible manual axis", () => {
    let settings = initialGraphSeriesSettings(base, [], []);
    settings = addManagedSeries(settings, { code: "bler", label: "BLER", unit: "%" })!;
    expect(addManagedSeries(settings, { code: "rsrp", label: "RSRP", unit: "dBm" })).toBeNull();
    expect(canAssignSeriesAxis(settings, "bler", "left")).toBe(false);
    expect(canAssignSeriesAxis(settings, "bler", "right")).toBe(true);
  });

  it("persists order, visibility, colors, axes and min/max per panel", () => {
    let settings = initialGraphSeriesSettings(base, [], []);
    settings = addManagedSeries(settings, { code: "bler", label: "BLER", unit: "%" })!;
    settings = {
      series: reorderManagedSeries(settings.series, "bler", base.code).map((item) =>
        item.code === "bler" ? { ...item, visible: false, color: "#123456" } : item,
      ),
      analysisMode: settings.analysisMode,
      distribution: settings.distribution,
      axes: {
        ...settings.axes,
        right: { ...settings.axes.right, auto: false, min: 0, max: 100, color: "#654321" },
      },
    };
    writeGraphSeriesSettings("workspace-a", "panel-a", settings);
    const stored = localStorage.getItem(graphSeriesSettingsKey("workspace-a", "panel-a"));
    expect(stored).not.toBeNull();
    expect(stored).not.toContain('"label"');
    expect(
      readGraphSeriesSettings("workspace-a", "panel-a", (code) =>
        code === "bler" ? "NR_BLER_MAC_DL_PSCELL" : "LTE_PDSCH_THP_SERVING_PCELL",
      ),
    ).toEqual({
      ...settings,
      series: settings.series.map((item) => ({
        ...item,
        label: item.code === "bler" ? "NR_BLER_MAC_DL_PSCELL" : "LTE_PDSCH_THP_SERVING_PCELL",
      })),
    });
    expect(readGraphSeriesSettings("workspace-a", "panel-b")).toBeNull();
  });

  it("keeps an empty persisted list so removing the last series does not close the graph", () => {
    const settings = initialGraphSeriesSettings(base, [], []);
    writeGraphSeriesSettings("workspace-a", "panel-a", { ...settings, series: [] });
    expect(readGraphSeriesSettings("workspace-a", "panel-a")?.series).toEqual([]);
  });

  it("persists the selected distribution mode per graph", () => {
    const settings = {
      ...initialGraphSeriesSettings(base, [], []),
      analysisMode: "cdf" as const,
      distribution: {
        ...initialGraphSeriesSettings(base, [], []).distribution,
        modes: { histogram: true, cdf: true, percentile: true },
        histogram: { yMode: "percentage" as const, color: "#123abc", opacity: 0.55 },
        percentiles: {
          values: [5, 10, 50, 90, 95],
          color: "#22aa44",
          width: 3,
          showLines: false,
          showMarkers: true,
          showLabels: false,
        },
      },
    };
    writeGraphSeriesSettings("workspace-a", "panel-a", settings);
    expect(readGraphSeriesSettings("workspace-a", "panel-a")?.analysisMode).toBe("cdf");
    expect(readGraphSeriesSettings("workspace-a", "panel-a")?.distribution).toEqual(
      settings.distribution,
    );
    expect(readGraphSeriesSettings("workspace-a", "panel-b")).toBeNull();
  });

  it("migrates the legacy red percentile default to green without changing custom colours", () => {
    const settings = initialGraphSeriesSettings(base, [], []);
    const legacy = {
      ...settings,
      distribution: {
        ...settings.distribution,
        percentiles: { values: [10, 50, 90], color: "#dc2626" },
      },
    };
    localStorage.setItem(graphSeriesSettingsKey("workspace-a", "legacy"), JSON.stringify(legacy));
    expect(readGraphSeriesSettings("workspace-a", "legacy")?.distribution.percentiles.color).toBe(
      "#16a34a",
    );
  });

  it("uses explicit min/max only when the manual domain is valid", () => {
    expect(
      graphAxisDomain({
        auto: false,
        min: 0,
        max: 100,
        unit: "%",
        color: "#64748b",
        visible: true,
      }),
    ).toEqual([0, 100]);
    expect(
      graphAxisDomain({
        auto: false,
        min: 100,
        max: 0,
        unit: "%",
        color: "#64748b",
        visible: true,
      }),
    ).toEqual(["auto", "auto"]);
  });
});
