import { describe, expect, it } from "vitest";
import {
  addMetricColumn, isMetricCol, messageInfo, metricCodeOf, moveColumn, pageItems, parseColumns,
  radioAt, removeMetricColumn, rrcStateAt, seriesValueAt, toggleColumn, defaultColumns,
  visibleColumns, knownOrder,
} from "@/features/signaling/message-columns";
import { initialCollapsed } from "@/features/signaling/DecoderTree";
import type { ProvenState } from "@/features/signaling/state-evidence";

const proc = (o: Partial<{ id: string; type: string; outcome: string; seq_start: number; boundary_seqs: number[] }>) => ({
  id: "p1", type: "rrc_connection", outcome: "ok", seq_start: 10, boundary_seqs: [10, 12, 20], ...o,
});

describe("Info column uses VM procedures only", () => {
  it("shows nothing for a message without procedure", () => {
    expect(messageInfo({ seq: 5, procedure_ids: [] }, [proc({})])).toBeNull();
  });
  it("shows nothing for an inner message that is not a boundary", () => {
    expect(messageInfo({ seq: 15, procedure_ids: ["p1"] }, [proc({})])).toBeNull();
  });
  it("a release message is not a failure unless the VM outcome says fail", () => {
    const ok = messageInfo({ seq: 20, procedure_ids: ["p1"] }, [proc({ type: "rrc_release" })]);
    expect(ok?.role).toBe("neutral");
    const fail = messageInfo({ seq: 20, procedure_ids: ["p1"] }, [proc({ type: "rrc_release", outcome: "fail" })]);
    expect(fail?.role).toBe("error");
  });
});

describe("RRC State column", () => {
  const s = { track: "RRC_STATE", state: "CONNECTED", startS: 1.4, endS: 24.182, sessionId: "context:x:54" } as ProvenState;
  it("is Connected only inside a proven interval", () => {
    expect(rrcStateAt(10, [s])?.state).toBe("CONNECTED");
    expect(rrcStateAt(30, [s])).toBeNull();
  });
  it("never treats a gap as Idle", () => {
    expect(rrcStateAt(0.5, [s])).toBeNull();
  });
});

describe("radio association", () => {
  const pts = [{ seq: 1, t_rel_s: 1, value: -95.2 }, { seq: 2, t_rel_s: 3, value: -97 }];
  it("uses the previous real observation and keeps Δt", () => {
    expect(radioAt(pts, 2.5)).toEqual({ value: -95.2, dtS: 1.5, seq: 1, t: 1 });
  });
  it("never invents a value before the first observation", () => {
    expect(radioAt(pts, 0.5)).toBeNull();
  });
});

describe("column config", () => {
  it("keeps mandatory columns visible", () => {
    expect(toggleColumn(defaultColumns(), "seq").visible).toContain("seq");
  });
  it("reorders and restores from storage", () => {
    const moved = moveColumn(defaultColumns(), "info", -1);
    expect(moved.order.indexOf("info")).toBe(moved.order.indexOf("message_name") - 1);
    expect(parseColumns(JSON.stringify(moved)).order).toEqual(moved.order);
    expect(parseColumns("not json")).toEqual(defaultColumns());
  });
});

describe("metric columns (Add Metric)", () => {
  it("adds a metric column at the end, visible, and removes it entirely", () => {
    const withMetric = addMetricColumn(defaultColumns(), "cell_rsrp@0");
    const key = "metric:cell_rsrp@0";
    expect(isMetricCol(key)).toBe(true);
    expect(metricCodeOf(key)).toBe("cell_rsrp@0");
    expect(withMetric.order.at(-1)).toBe(key);
    expect(visibleColumns(withMetric)).toContain(key);
    expect(knownOrder(withMetric)).toContain(key);
    const removed = removeMetricColumn(withMetric, "cell_rsrp@0");
    expect(removed.order).not.toContain(key);
    expect(removed.visible).not.toContain(key);
  });
  it("re-adding an existing metric only re-shows it, without duplicating", () => {
    const once = addMetricColumn(defaultColumns(), "dci_count@0");
    const hidden = toggleColumn(once, "metric:dci_count@0");
    expect(visibleColumns(hidden)).not.toContain("metric:dci_count@0");
    const reshown = addMetricColumn(hidden, "dci_count@0");
    expect(reshown.order.filter((k) => k === "metric:dci_count@0")).toHaveLength(1);
    expect(visibleColumns(reshown)).toContain("metric:dci_count@0");
  });
  it("survives a storage round-trip while unknown keys are dropped", () => {
    const config = addMetricColumn(defaultColumns(), "cell_rsrq@0");
    const restored = parseColumns(JSON.stringify(config));
    expect(restored.order).toContain("metric:cell_rsrq@0");
    expect(restored.visible).toContain("metric:cell_rsrq@0");
    const withJunk = parseColumns(
      JSON.stringify({ order: ["seq", "bogus", "metric:cell_rsrq@0"], visible: ["seq"] }),
    );
    expect(withJunk.order).not.toContain("bogus");
    expect(withJunk.order).toContain("metric:cell_rsrq@0");
  });
  it("reads the previous real observation, numeric or categorical, never interpolated", () => {
    const pts = [
      { seq: 1, t_rel_s: 1, value: -95.2 },
      { seq: 2, t_rel_s: 3, value: "CONNECTED" },
    ];
    expect(seriesValueAt(pts, 2.5)).toEqual({ value: -95.2, dtS: 1.5, seq: 1, t: 1 });
    expect(seriesValueAt(pts, 4)).toEqual({ value: "CONNECTED", dtS: 1, seq: 2, t: 3 });
    expect(seriesValueAt(pts, 0.5)).toBeNull();
    expect(seriesValueAt(pts, null)).toBeNull();
  });
});

it("pagination shows ellipses", () => {
  expect(pageItems(1, 137)).toEqual([1, 2, "…", 137]);
});

it("ASN.1 tree opens fully when small and progressively when huge", () => {
  expect(initialCollapsed([{ path: "a/b/c/d" }]).size).toBe(0);
  const big = Array.from({ length: 500 }, (_, i) => ({ path: `r/x${i}/y/z/leaf` }));
  const c = initialCollapsed(big);
  expect(c.has("r/x1")).toBe(false);
  expect(c.has("r/x1/y/z")).toBe(true);
});
