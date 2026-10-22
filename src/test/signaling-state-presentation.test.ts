import { describe, it, expect } from "vitest";
import type { ProvenState } from "@/features/signaling/state-evidence";
import { statePresentation, stateBandGeometry, stateLaneLayout } from "@/features/signaling/state-presentation";

const base: ProvenState = {
  event: {} as ProvenState["event"], track: "UE_STATE", captureId: "capture", sessionId: "session",
  technology: "LTE", state: "LTE", startS: 1.4, endS: 24.182,
  componentCarriers: null, carrierStatus: null, evidenceSeqs: [234, 243, 1608],
};
describe("V9 evidence-only product mapping", () => {
  it("never fabricates a carrier count when absent", () => {
    expect(statePresentation(base)?.count).toBeNull();
  });
  it("uses actual counts instead of hardcoded 2CC", () => {
    expect(statePresentation({ ...base, componentCarriers: 3, carrierStatus: "USED" })?.count).toBe(3);
  });
  it("preserves configured versus activated versus used evidence", () => {
    for (const status of ["CONFIGURED", "ACTIVATED", "USED"] as const)
      expect(statePresentation({ ...base, componentCarriers: 2, carrierStatus: status })?.status).toBe(status);
  });
  it("configured SCells alone do not assert active advanced LTE mode", () => {
    expect(statePresentation({ ...base, track: "RRC_STATE", state: "CONNECTED", componentCarriers: 2, carrierStatus: "CONFIGURED" })?.key).toBe("lte");
  });
  it("activated CA establishes the advanced LTE product mode", () => {
    expect(statePresentation({ ...base, track: "RRC_STATE", state: "CONNECTED", componentCarriers: 2, carrierStatus: "ACTIVATED" })?.key).toBe("lteAdvanced");
  });
  it("NR technology alone does not assert ENDC or SA", () => {
    for (const technology of ["NR_NSA", "NR_SA"] as const)
      expect(statePresentation({ ...base, track: "RRC_STATE", state: "CONNECTED", technology })).toBeNull();
  });
  it("does not convert absent intervals into Idle", () => {
    expect(statePresentation(base)?.key).toBe("lte");
    expect(statePresentation({ ...base, track: "RRC_STATE", state: "IDLE" })?.key).toBe("idleMode");
  });
  it("keeps simultaneous proven LTE and NR in independent subbands", () => {
    const nr = { ...base, technology: "NR_NSA" as const, state: "NR" as const };
    expect(stateBandGeometry(base, [base, nr])).toEqual({ offset: -9, height: 16 });
    expect(stateBandGeometry(nr, [base, nr])).toEqual({ offset: 9, height: 16 });
  });
  it("does not create new interval bounds or merge different sessions", () => {
    const other = { ...base, sessionId: "other", startS: 24.182, endS: 30 };
    statePresentation(other);
    expect([base.startS, base.endS, other.startS, other.endS]).toEqual([1.4, 24.182, 24.182, 30]);
  });
  it("uses 42 px state tracks separated by 4 px while preserving other track pitch", () => {
    expect(stateLaneLayout(["uestate", "rrcstate", "network", "mobility"])).toEqual({ centers: [21, 67, 114, 158], height: 180 });
  });
});