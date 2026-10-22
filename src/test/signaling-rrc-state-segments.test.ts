import { describe, expect, it } from "vitest";
import type { ProvenState } from "@/features/signaling/state-evidence";
import { rrcStateSegments } from "@/features/signaling/rrc-state-segments";

const proof = (state: "CONNECTED" | "IDLE", startS: number, endS: number): ProvenState =>
  ({
    event: { id: `${state}:${startS}`, attrs: {} },
    track: "RRC_STATE",
    captureId: "capture",
    sessionId: "session",
    technology: "LTE",
    state,
    startS,
    endS,
    componentCarriers: null,
    carrierStatus: null,
    evidenceSeqs: [1, 2, 3],
  }) as ProvenState;

describe("RRC State presentation segments", () => {
  it("keeps proven LTE bounds exact and marks bounded gaps unknown", () => {
    const segments = rrcStateSegments([proof("CONNECTED", 1.4, 24.182)], 30);
    expect(segments.map(({ state, startS, endS }) => ({ state, startS, endS }))).toEqual([
      { state: "UNKNOWN", startS: 0, endS: 1.4 },
      { state: "CONNECTED", startS: 1.4, endS: 24.182 },
      { state: "UNKNOWN", startS: 24.182, endS: 30 },
    ]);
  });

  it("shows Idle only when an explicit proven Idle interval exists", () => {
    const segments = rrcStateSegments(
      [proof("IDLE", 0, 4), proof("CONNECTED", 4, 9), proof("IDLE", 9, 12)],
      12,
    );
    expect(segments.map((segment) => segment.state)).toEqual(["IDLE", "CONNECTED", "IDLE"]);
    expect(segments[0]?.endS).toBe(segments[1]?.startS);
    expect(segments[1]?.endS).toBe(segments[2]?.startS);
  });

  it("rounds only the two outer capture edges", () => {
    const segments = rrcStateSegments([proof("CONNECTED", 2, 8)], 10);
    expect(segments.map(({ roundStart, roundEnd }) => [roundStart, roundEnd])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it("does not use UE State evidence to populate RRC State", () => {
    const ue = { ...proof("CONNECTED", 2, 8), track: "UE_STATE" as const, state: "LTE" as const };
    expect(rrcStateSegments([ue], 10).map((segment) => segment.state)).toEqual(["UNKNOWN"]);
  });
});
