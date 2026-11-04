import { describe, expect, it } from "vitest";
import { decodeTabs, encodeTabs, newTabsState, updateTab } from "@/features/kpi/workspace-tabs";

describe("KPI signaling panels per workspace tab", () => {
  it("round-trips multiple independent panel instances", () => {
    const state = newTabsState();
    const active = state.activeTabId;
    const withPanels = updateTab(state, active, {
      signalingPanels: [
        { id: "signaling-a", kind: "signaling" },
        { id: "signaling-b", kind: "signaling" },
        { id: "timeline-a", kind: "timeline" },
      ],
    });

    expect(decodeTabs(encodeTabs(withPanels))).toEqual(withPanels);
  });

  it("keeps legacy tabs compatible when no signaling panel was saved", () => {
    const encoded = btoa(JSON.stringify({
      t: [{ i: "legacy", n: "Workspace", c: [], a: null, l: "auto", o: 0 }],
      a: "legacy",
    }));

    expect(decodeTabs(encoded)?.tabs[0]?.signalingPanels).toEqual([]);
  });
});
