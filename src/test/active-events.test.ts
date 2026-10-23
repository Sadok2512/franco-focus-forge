import { describe, expect, it } from "vitest";
import { eventId, eventsAt, toggleIn, type ActiveEvent } from "@/features/kpi/active-events";

const ev = (seq: number, t: number, cap = "c1"): ActiveEvent => ({
  id: eventId(cap, "ho", seq), captureId: cap, t_rel_s: t, label: `HO ${seq}`, type: "ho", color: "#dc2626",
});

describe("event click toggle", () => {
  it("first click shows, second click hides", () => {
    const on = toggleIn(new Map(), ev(1, 10));
    expect(on.size).toBe(1);
    expect(toggleIn(on, ev(1, 10)).size).toBe(0);
  });
  it("keeps other events when one is hidden", () => {
    let m = toggleIn(toggleIn(new Map(), ev(1, 10)), ev(2, 20));
    m = toggleIn(m, ev(1, 10));
    expect([...m.keys()]).toEqual([eventId("c1", "ho", 2)]);
  });
  it("highlights only exact timestamps of the same capture", () => {
    const active = [ev(1, 10), ev(2, 20, "c2")];
    expect(eventsAt(active, "c1", 10)).toHaveLength(1);
    expect(eventsAt(active, "c1", 11)).toHaveLength(0);
    expect(eventsAt(active, "c1", 20)).toHaveLength(0);
  });
});
