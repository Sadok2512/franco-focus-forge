import { describe, expect, it } from "vitest";
import {
  messageInfo, moveColumn, pageItems, parseColumns, radioAt, rrcStateAt, toggleColumn, defaultColumns,
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
