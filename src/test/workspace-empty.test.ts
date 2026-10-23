import { describe, expect, it } from "vitest";
import {
  activeTab,
  addTab,
  decodeTabs,
  encodeTabs,
  initialTabsState,
  migrateMetrics,
  newTabsState,
  updateTab,
  type WorkspaceTabsState,
} from "@/features/kpi/workspace-tabs";

describe("empty new workspaces", () => {
  it("creates no KPI or metric graphs and preserves the previous workspace", () => {
    const initial = newTabsState(["LTE_RACH_ATTEMPTS"]);
    const populated = updateTab(initial, initial.activeTabId, { metricCodes: ["ci_rs_snr@0", "ci_rs_snr@1"] });
    const next = addTab(populated);
    expect(activeTab(next).codes).toEqual([]);
    expect(activeTab(next).metricCodes).toEqual([]);
    expect(next.tabs[0]?.metricCodes).toEqual(["ci_rs_snr@0", "ci_rs_snr@1"]);
    const restored = decodeTabs(encodeTabs(next));
    expect(restored).toEqual(next);
    if (!restored) throw new Error("Missing restored workspace");
    expect(activeTab({ ...restored, activeTabId: initial.activeTabId }).codes).toEqual(["LTE_RACH_ATTEMPTS"]);
    expect(activeTab({ ...restored, activeTabId: initial.activeTabId }).metricCodes).toEqual(["ci_rs_snr@0", "ci_rs_snr@1"]);
  });
  it("imports legacy metrics only into the active workspace, never into new ones", () => {
    const legacy = addTab(newTabsState());
    legacy.tabs = legacy.tabs.map(({ metricCodes: _metrics, ...tab }) => tab);
    const migrated = migrateMetrics(legacy, ["ci_rs_snr@0"]);
    expect(migrated.tabs[0]?.metricCodes).toEqual([]);
    expect(activeTab(migrated).metricCodes).toEqual(["ci_rs_snr@0"]);
    const next = addTab(migrated);
    expect(activeTab(migrateMetrics(next, ["ci_rs_snr@0"])).metricCodes).toEqual([]);
  });
});

describe("first launch of a project", () => {
  it("starts empty even when the link still carries an old metric selection", () => {
    const fresh = initialTabsState({
      urlTabs: "",
      storedTabs: null,
      legacyMetrics: ["cell_rsrp@0", "cell_rsrq@0"],
    });
    expect(fresh.tabs).toHaveLength(1);
    expect(activeTab(fresh).codes).toEqual([]);
    expect(activeTab(fresh).metricCodes).toEqual([]);
  });

  it("restores a saved session from the link or from the memory of the project", () => {
    const saved = updateTab(newTabsState(["LTE_RACH_ATTEMPTS"]), newTabsState(["LTE_RACH_ATTEMPTS"]).activeTabId, {
      metricCodes: ["cell_rsrp@0"],
    });
    const encoded = encodeTabs(saved);
    const fromUrl = initialTabsState({ urlTabs: encoded, storedTabs: null, legacyMetrics: [] });
    expect(activeTab(fromUrl).codes).toEqual(["LTE_RACH_ATTEMPTS"]);
    expect(activeTab(fromUrl).metricCodes).toEqual(["cell_rsrp@0"]);
    const fromMemory = initialTabsState({ urlTabs: "", storedTabs: encoded, legacyMetrics: [] });
    expect(activeTab(fromMemory).codes).toEqual(["LTE_RACH_ATTEMPTS"]);
    expect(activeTab(fromMemory).metricCodes).toEqual(["cell_rsrp@0"]);
  });

  it("fills a tab saved before metric views existed, but never the empty first tab", () => {
    const beforeViews: WorkspaceTabsState = {
      tabs: [
        {
          id: "t1",
          name: "Workspace",
          codes: ["LTE_RACH_ATTEMPTS"],
          activeCode: "LTE_RACH_ATTEMPTS",
          layout: "auto",
          overlay: false,
        },
      ],
      activeTabId: "t1",
    };
    expect(decodeTabs(encodeTabs(beforeViews))?.tabs[0]?.metricCodes).toBeUndefined();
    expect(
      activeTab(initialTabsState({ urlTabs: encodeTabs(beforeViews), storedTabs: null, legacyMetrics: ["cell_rsrp@0"] }))
        .metricCodes,
    ).toEqual(["cell_rsrp@0"]);
    expect(
      activeTab(initialTabsState({ urlTabs: "", storedTabs: null, legacyMetrics: ["cell_rsrp@0"] })).metricCodes,
    ).toEqual([]);
  });
});
