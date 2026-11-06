import { describe, expect, it } from "vitest";
import { clusterTimelineEvents, isCompactTimelineEvent } from "@/features/signaling/RfTimeline";
import type { RfEvent } from "@/lib/api/signaling";

function point(seq: number, time: number, track = "network"): RfEvent {
  return {
    id: `event-${seq}`,
    lane: track,
    type: "RRC",
    kind: "mark",
    seq,
    seq_end: null,
    t_rel_s: time,
    t_rel_end_s: null,
    duration_ms: null,
    outcome: null,
    cause: null,
    label: `Event ${seq}`,
    attrs: { track },
    pivot_seq: seq,
    linked_seqs: [seq],
    link_rule: "explicit",
    seq_gap: null,
  } as RfEvent;
}

describe("KPI Timeline V2 event clustering", () => {
  it("groups close icons without losing any source event", () => {
    const events = [point(1, 10), point(2, 10.1), point(3, 80)];
    const groups = clusterTimelineEvents(events, [0, 100], 1_000, true);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.members.map((event) => event.seq)).toEqual([1, 2]);
    expect(groups.flatMap((group) => group.members)).toHaveLength(events.length);
  });

  it("does not merge events from different task lanes", () => {
    const groups = clusterTimelineEvents(
      [point(1, 10, "dl"), point(2, 10.01, "ul")],
      [0, 100],
      1_000,
      true,
    );
    expect(groups).toHaveLength(2);
  });

  it("never clusters duration bars", () => {
    const task = { ...point(1, 10, "dl"), t_rel_end_s: 20, duration_ms: 10_000 };
    const groups = clusterTimelineEvents([task, point(2, 10.01, "dl")], [0, 100], 1_000, true);
    expect(groups).toHaveLength(2);
  });

  it("keeps certified procedure source types and rejects ordinary radio chatter", () => {
    expect(isCompactTimelineEvent({ ...point(1, 1), type: "RRCConnectionSetupComplete" })).toBe(
      true,
    );
    expect(isCompactTimelineEvent({ ...point(2, 2), type: "HOA" })).toBe(true);
    expect(isCompactTimelineEvent({ ...point(3, 3), type: "SCGFailureInformationNR" })).toBe(true);
    expect(isCompactTimelineEvent({ ...point(4, 4), type: "MeasurementReport" })).toBe(false);
  });
});
