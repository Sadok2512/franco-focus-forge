import { describe, expect, it } from "vitest";
import type { RfEvent } from "@/lib/api/signaling";
import { provenState, provenStates, stateLabelKey } from "@/features/signaling/state-evidence";
import { WINDOW_PRESETS } from "@/features/signaling/WindowSelector";
import {
  clampWindow,
  DEFAULT_WINDOW_S,
  FULL_CAPTURE_S,
  followMessage,
} from "@/features/signaling/time-window";

const event: RfEvent = {
  id: "lte",
  lane: "connexion",
  type: "ue_state",
  kind: "band",
  seq: 12,
  seq_end: 19,
  t_rel_s: 120,
  t_rel_end_s: 160,
  duration_ms: 40000,
  outcome: "ok",
  cause: null,
  label: "LTE",
  attrs: {
    track: "ue_state",
    state: "LTE",
    technology: "LTE",
    session_id: "ue-1",
    evidence_status: "PROVEN",
    source_seqs: [12, 19],
    rule_id: "validated",
    rule_version: "1",
  },
  pivot_seq: 12,
  linked_seqs: [12, 19],
  link_rule: "explicit",
  seq_gap: 0,
};
describe("Signaling V2 evidence gates", () => {
  it("G1 accepts only proven supplied bounds", () => {
    expect(provenState(event, "capture")?.startS).toBe(120);
    expect(provenState({ ...event, t_rel_end_s: null }, "capture")).toBeNull();
    expect(
      provenState({ ...event, attrs: { ...event.attrs, evidence_status: "PARTIAL" } }, "capture"),
    ).toBeNull();
  });
  it("G2 preserves independent RRC Connected and Idle from explicit states", () => {
    for (const state of ["CONNECTED", "IDLE"])
      expect(
        provenState({ ...event, attrs: { ...event.attrs, track: "RRC_STATE", state } }, "capture")
          ?.state,
      ).toBe(state);
    expect(
      provenState({ ...event, attrs: { ...event.attrs, state: undefined } }, "capture"),
    ).toBeNull();
  });
  it("G3 LTE 4C requires proven count, status and explicit definition", () => {
    const attrs = {
      ...event.attrs,
      component_carriers: 4,
      carrier_status: "CONFIGURED",
      carrier_definition: "COMPONENT_CARRIERS",
      ca_evidence_status: "PROVEN",
    };
    expect(provenState({ ...event, attrs }, "capture")?.componentCarriers).toBe(4);
    expect(
      provenState({ ...event, attrs: { ...attrs, ca_evidence_status: undefined } }, "capture")
        ?.componentCarriers,
    ).toBeNull();
    expect(
      provenState(
        { ...event, attrs: { ...attrs, carrier_definition: "MEASURED_FREQUENCIES" } },
        "capture",
      )?.componentCarriers,
    ).toBeNull();
  });
  it("G3 NR 2C requires explicit activated carrier proof", () => {
    const state = provenState(
      {
        ...event,
        attrs: {
          ...event.attrs,
          state: "NR",
          technology: "NR_NSA",
          component_carriers: 2,
          carrier_status: "ACTIVATED",
          carrier_definition: "COMPONENT_CARRIERS",
          ca_evidence_status: "PROVEN",
        },
      },
      "capture",
    );
    expect(state?.componentCarriers).toBe(2);
    if (!state) throw new Error("Missing proven NR fixture");
    expect(stateLabelKey(state)).toBe("signalingV2.nr2");
  });
  it("G4 permits simultaneous LTE and NR NSA without replacement", () => {
    const nr = { ...event, id: "nr", attrs: { ...event.attrs, state: "NR", technology: "NR_NSA" } };
    expect(provenStates([event, nr], "capture").map((s) => s.technology)).toEqual([
      "LTE",
      "NR_NSA",
    ]);
  });
  it("G5 never fuses distinct overlapping sessions", () => {
    expect(
      provenStates(
        [event, { ...event, id: "other", attrs: { ...event.attrs, session_id: "ue-2" } }],
        "capture",
      ),
    ).toEqual([]);
    expect(
      provenState({ ...event, attrs: { ...event.attrs, session_id: undefined } }, "capture"),
    ).toBeNull();
  });
  it("requires explicit start and end evidence sequences", () => {
    expect(
      provenState({ ...event, attrs: { ...event.attrs, source_seqs: [12] } }, "capture"),
    ).toBeNull();
    expect(
      provenState({ ...event, attrs: { ...event.attrs, capture_id: "other" } }, "capture"),
    ).toBeNull();
  });
  it("G6 uses 30 seconds in V2 without changing stable full capture", () => {
    expect(DEFAULT_WINDOW_S).toBe(30);
    expect(clampWindow(632.851, 0)).toEqual([0, 30]);
    expect(clampWindow(632.851, 0, FULL_CAPTURE_S)).toEqual([0, 632.851]);
  });
  it("G7 offers 10/30/60/120 and Fit", () => {
    expect([...WINDOW_PRESETS]).toEqual([10, 30, 60, 120]);
    expect(clampWindow(632.851, 0, FULL_CAPTURE_S)).toEqual([0, 632.851]);
  });
  it("G11 follows 245.318 without changing chosen width", () => {
    expect(followMessage([0, 30], 245.318, 632.851)).toEqual([230.318, 260.318]);
  });
});

describe("LTE Connected via (capture_id, context_id)", () => {
  const base = {
    id: "ctx",
    seq: 84,
    seq_end: 95,
    t_rel_s: 0.001,
    t_rel_end_s: 1.5,
    attrs: {
      track: "lte",
      technology: "LTE",
      capture_id: "cap",
      context_id: "7",
      source_seqs: [72, 84, 95],
      evidence_status: "PROVEN",
      rule_id: "nemo_context_connected",
      rule_version: "1.0.0",
    },
  } as unknown as Parameters<typeof provenState>[0];
  const withAttrs = (x: Record<string, unknown>) =>
    ({ ...base, attrs: { ...base.attrs, ...x } }) as typeof base;
  it("accepts the full RRA -> RRC -> RRD chain with composite id", () => {
    expect(provenState(base, "cap")?.sessionId).toBe("cap:7");
  });
  it("rejects PARTIAL evidence", () => {
    expect(provenState(withAttrs({ evidence_status: "PARTIAL" }), "cap")).toBeNull();
  });
  it("rejects another rule", () => {
    expect(provenState(withAttrs({ rule_id: "other" }), "cap")).toBeNull();
  });
  it("rejects incomplete chain", () => {
    expect(provenState(withAttrs({ source_seqs: [84, 95] }), "cap")).toBeNull();
  });
  it("rejects missing capture_id", () => {
    expect(provenState(withAttrs({ capture_id: undefined }), "cap")).toBeNull();
  });
});
