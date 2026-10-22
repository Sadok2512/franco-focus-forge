import { describe, expect, it } from "vitest";
import { activeTab, addTab, decodeTabs, encodeTabs, migrateMetrics, newTabsState, updateTab } from "@/features/kpi/workspace-tabs";

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