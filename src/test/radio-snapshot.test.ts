import { beforeEach, describe, expect, it } from "vitest";
import type { MetricInfo } from "@/lib/api/metrics-schemas";
import {
  defaultSnapshotConfiguration,
  defaultSnapshotThreshold,
  readRadioSnapshotConfiguration,
  reorderSnapshotMetrics,
  snapshotBarPosition,
  snapshotValueColor,
  writeRadioSnapshotConfiguration,
} from "@/features/kpi/RadioSnapshotPanel";

const metric = (code: string, available = true, n = 1): MetricInfo =>
  ({ code, available, n_in_project: n, kind: "KPI" }) as MetricInfo;

describe("Radio Snapshot configuration", () => {
  beforeEach(() => localStorage.clear());

  it("starts only with certified available RF metrics", () => {
    const config = defaultSnapshotConfiguration([
      metric("cell_rsrp@lte-type-0"),
      metric("cell_rsrq@lte-type-0", false),
      metric("cell_sinr@nr-type-199", true, 0),
      metric("cell_rsrp@nr-type-199"),
    ]);

    expect(config.metrics).toEqual(["cell_rsrp@lte-type-0", "cell_rsrp@nr-type-199"]);
  });

  it("persists order, badges and thresholds per workspace panel", () => {
    const catalog = [metric("cell_rsrp@lte-type-0")];
    const config = defaultSnapshotConfiguration(catalog);
    config.showBadges = false;
    config.thresholds["cell_rsrp@lte-type-0"]!.min = -150;
    writeRadioSnapshotConfiguration("workspace-a", "panel-a", config);

    expect(readRadioSnapshotConfiguration("workspace-a", "panel-a", catalog)).toEqual(config);
    expect(readRadioSnapshotConfiguration("workspace-b", "panel-a", catalog).showBadges).toBe(true);
  });

  it("reorders metric rows without adding or losing a metric", () => {
    const metrics = ["rsrp", "rsrq", "sinr", "bler"];

    expect(reorderSnapshotMetrics(metrics, "rsrq", "bler")).toEqual([
      "rsrp",
      "sinr",
      "bler",
      "rsrq",
    ]);
    expect(reorderSnapshotMetrics(metrics, "bler", "rsrp")).toEqual([
      "bler",
      "rsrp",
      "rsrq",
      "sinr",
    ]);
    expect(reorderSnapshotMetrics(metrics, "missing", "rsrp")).toEqual(metrics);
    expect(metrics).toEqual(["rsrp", "rsrq", "sinr", "bler"]);
  });

  it("positions the value in its RF range and applies directional thresholds", () => {
    const rsrp = defaultSnapshotThreshold("cell_rsrp@lte-type-0");
    expect(snapshotBarPosition(-90, rsrp)).toBe(50);
    expect(snapshotBarPosition(-200, rsrp)).toBe(0);
    expect(snapshotBarPosition(10, rsrp)).toBe(100);
    expect(snapshotValueColor(-120, rsrp)).toBe(rsrp.colors[0]);
    expect(snapshotValueColor(-100, rsrp)).toBe(rsrp.colors[1]);
    expect(snapshotValueColor(-80, rsrp)).toBe(rsrp.colors[2]);

    const bler = defaultSnapshotThreshold("cell_bler@lte-type-0");
    expect(snapshotValueColor(1, bler)).toBe(bler.colors[2]);
    expect(snapshotValueColor(5, bler)).toBe(bler.colors[1]);
    expect(snapshotValueColor(20, bler)).toBe(bler.colors[0]);
  });
});
