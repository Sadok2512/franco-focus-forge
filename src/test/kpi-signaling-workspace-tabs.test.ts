import { describe, expect, it } from "vitest";
import { decodeTabs, encodeTabs, newTabsState, updateTab } from "@/features/kpi/workspace-tabs";

describe("KPI signaling panels per workspace tab", () => {
  it("round-trips multiple independent panel instances", () => {
    const state = newTabsState();
    const active = state.activeTabId;
    const withPanels = updateTab(state, active, {
      signalingPanels: [
        { id: "signaling-a", kind: "l3", selectedSeq: 4242 },
        { id: "signaling-b", kind: "l3" },
        { id: "timeline-a", kind: "timeline" },
      ],
    });

    expect(decodeTabs(encodeTabs(withPanels))).toEqual(withPanels);
  });

  it("keeps legacy tabs compatible when no signaling panel was saved", () => {
    const encoded = btoa(
      JSON.stringify({
        t: [{ i: "legacy", n: "Workspace", c: [], a: null, l: "auto", o: 0 }],
        a: "legacy",
      }),
    );

    expect(decodeTabs(encoded)?.tabs[0]?.signalingPanels).toEqual([]);
  });

  it("migrates the previously deployed full-page signaling panel to L3", () => {
    const encoded = btoa(
      JSON.stringify({
        t: [
          {
            i: "legacy",
            n: "Workspace",
            c: [],
            a: null,
            l: "auto",
            o: 0,
            s: [{ id: "old", kind: "signaling" }],
          },
        ],
        a: "legacy",
      }),
    );
    expect(decodeTabs(encoded)?.tabs[0]?.signalingPanels).toEqual([{ id: "old", kind: "l3" }]);
  });
});
