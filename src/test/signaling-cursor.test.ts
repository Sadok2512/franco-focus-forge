import { describe, it, expect } from "vitest";
import {
  previousObservation,
  stepTime,
  availableTimes,
  activeIntervals,
  eventMessage,
} from "@/features/signaling/cursor";
import type { RfEvent } from "@/lib/api/signaling";
const event: RfEvent = {
  id: "scg",
  lane: "endc",
  type: "scg",
  kind: "mark",
  seq: 1012,
  seq_end: null,
  t_rel_s: 245.318,
  t_rel_end_s: null,
  duration_ms: null,
  outcome: null,
  cause: null,
  label: "SCG",
  attrs: { evidence_status: "PROVEN" },
  pivot_seq: 1012,
  linked_seqs: [1012, 1013],
  link_rule: "explicit",
  seq_gap: 0,
};
describe("Signaling cursor integrity", () => {
  it("retains exact event time, never rounded from sequence", () =>
    expect(availableTimes([event], [])).toEqual([245.318]));
  it("uses exact observation before previous observation", () =>
    expect(
      previousObservation([{ t_rel_s: 245.318, value: -82.3, seq: 1012 }], 245.318)?.value,
    ).toBe(-82.3));
  it("never interpolates or takes a future sample", () =>
    expect(
      previousObservation(
        [
          { t_rel_s: 240, value: -90, seq: 1000 },
          { t_rel_s: 250, value: -70, seq: 1020 },
        ],
        245.318,
      )?.value,
    ).toBe(-90));
  it("missing measurements are not zero", () =>
    expect(previousObservation([{ t_rel_s: 250, value: -70, seq: 1020 }], 245.318)).toBeNull());
  it("keyboard navigates exact available times", () =>
    expect(stepTime([120.452, 245.318, 412.703], 245.318, 1)).toBe(412.703));
  it("does not link an unproven pivot", () =>
    expect(eventMessage({ ...event, pivot_seq: 999, linked_seqs: [] })).toBeNull());
  it("allows overlapping proven LTE and NSA intervals", () =>
    expect(
      activeIntervals(
        [
          { ...event, id: "lte", t_rel_s: 120, t_rel_end_s: 300 },
          { ...event, id: "nsa", t_rel_s: 245.318, t_rel_end_s: 400 },
        ],
        250,
      ).map((e) => e.id),
    ).toEqual(["lte", "nsa"]));
  it("does not promote a partial interval to proven activity", () =>
    expect(
      activeIntervals(
        [{ ...event, t_rel_s: 120, t_rel_end_s: 300, attrs: { evidence_status: "PARTIAL" } }],
        250,
      ),
    ).toEqual([]));
});
