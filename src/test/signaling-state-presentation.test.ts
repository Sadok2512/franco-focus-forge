import { describe, it, expect } from "vitest";
import type { ProvenState } from "@/features/signaling/state-evidence";
import {
  statePresentation,
  stateBandGeometry,
  stateLaneLayout,
  rrcStateLaneLabel,
  stateLaneTitle,
} from "@/features/signaling/state-presentation";

const base: ProvenState = {
  event: {
    id: "fixture",
    lane: "connexion",
    type: "ue_state",
    kind: "band",
    seq: 234,
    seq_end: 1608,
    t_rel_s: 1.4,
    t_rel_end_s: 24.182,
    duration_ms: 22782,
    outcome: null,
    cause: null,
    label: "LTE",
    attrs: {},
    pivot_seq: 243,
    linked_seqs: [234, 243, 1608],
    link_rule: "explicit",
    seq_gap: null,
  },
  track: "UE_STATE",
  captureId: "capture",
  sessionId: "session",
  technology: "LTE",
  state: "LTE",
  startS: 1.4,
  endS: 24.182,
  componentCarriers: null,
  carrierStatus: null,
  evidenceSeqs: [234, 243, 1608],
};
describe("V9 evidence-only product mapping", () => {
  it("never fabricates a carrier count when absent", () => {
    expect(statePresentation(base)?.count).toBeNull();
  });
  it("uses actual counts instead of hardcoded 2CC", () => {
    expect(statePresentation({ ...base, componentCarriers: 3, carrierStatus: "USED" })?.count).toBe(
      3,
    );
  });
  it("preserves configured versus activated versus used evidence", () => {
    for (const status of ["CONFIGURED", "ACTIVATED", "USED"] as const)
      expect(
        statePresentation({ ...base, componentCarriers: 2, carrierStatus: status })?.status,
      ).toBe(status);
  });
  it("RRC State lane only exposes Idle or Connected, independent of CA state", () => {
    for (const carrierStatus of ["CONFIGURED", "ACTIVATED", "USED"] as const)
      expect(
        statePresentation({
          ...base,
          track: "RRC_STATE",
          state: "CONNECTED",
          componentCarriers: 2,
          carrierStatus,
        })?.key,
      ).toBe("connected");
  });
  it("RRC State Connected keeps the connected key for NR technologies too", () => {
    for (const technology of ["LTE", "NR_NSA", "NR_SA"] as const)
      expect(
        statePresentation({ ...base, track: "RRC_STATE", state: "CONNECTED", technology })?.key,
      ).toBe("connected");
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
  it("uses 42 px state tracks separated by 4 px while preserving other track pitch", () => {
    expect(stateLaneLayout(["uestate", "rrcstate", "network", "mobility"])).toEqual({
      centers: [21, 67, 114, 158],
      height: 180,
    });
  });
  it("keeps the RRC State title without an Idle badge on the lane label", () => {
    const label = rrcStateLaneLabel("RRC State");
    expect(label).toContain("RRC State");
    expect(label.startsWith("{title|")).toBe(true);
    expect(label).not.toContain("Idle");
  });
  it("shows the RRC State title with no badge in the lane gutter", () => {
    const labels = { ueState: "UE State", rrcState: "RRC State" };
    expect(stateLaneTitle("rrcstate", labels)).toEqual({ title: "RRC State", badge: null });
    expect(stateLaneTitle("uestate", labels)).toEqual({ title: "UE State", badge: null });
  });
});
