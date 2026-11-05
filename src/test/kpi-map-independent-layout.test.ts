import { describe, expect, it } from "vitest";
import { isMapOnlyWorkspace } from "@/features/kpi/workspace-map-layout";

const base = {
  metricsTablePane: false,
  metricCardPanelCount: 1,
  selectedMetrics: ["rsrp"],
  metricViews: { rsrp: "map" as const },
  kpiCodes: [] as string[],
  kpiPanelCount: 0,
  signalingPanelCount: 0,
};

describe("KPI map workspace layout", () => {
  it("fills the workspace only when the map is genuinely alone", () => {
    expect(isMapOnlyWorkspace(base)).toBe(true);
    expect(
      isMapOnlyWorkspace({
        ...base,
        selectedMetrics: [],
        metricViews: {},
        kpiCodes: ["kpi-rsrp"],
      }),
    ).toBe(true);
  });

  it("keeps Timeline and L3 panels in independent grid rows", () => {
    expect(isMapOnlyWorkspace({ ...base, signalingPanelCount: 1 })).toBe(false);
    expect(isMapOnlyWorkspace({ ...base, signalingPanelCount: 2 })).toBe(false);
  });

  it("does not swallow graph, table or KPI neighbours", () => {
    expect(isMapOnlyWorkspace({ ...base, metricCardPanelCount: 2 })).toBe(false);
    expect(isMapOnlyWorkspace({ ...base, metricsTablePane: true })).toBe(false);
    expect(isMapOnlyWorkspace({ ...base, kpiPanelCount: 1 })).toBe(false);
  });
});
