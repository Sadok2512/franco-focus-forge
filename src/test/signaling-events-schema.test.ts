import { describe, expect, it } from "vitest";
import { signalingSchemas } from "@/lib/api/signaling";

const envelope = { project_id: "p1", capture_id: "cap1", result_id: "r1" };

function stateEvent(lane: string) {
  return {
    id: `e-${lane}`,
    lane,
    type: "state_interval",
    kind: "band",
    seq: 10,
    seq_end: 40,
    t_rel_s: 5,
    t_rel_end_s: 20,
    duration_ms: 15000,
    outcome: "ok",
    cause: null,
    label: "CONNECTED",
    attrs: {
      track: lane.toUpperCase(),
      state: "CONNECTED",
      technology: "LTE",
      evidence_status: "PROVEN",
      session_id: "sess-1",
      capture_id: "cap1",
      rule_id: "rrc_state_v1",
      rule_version: "1",
      source_seqs: [10, 40],
    },
    pivot_seq: 10,
    linked_seqs: [10, 40],
    link_rule: "none",
    seq_gap: 0,
  };
}

function payload(events: unknown[]) {
  return {
    ...envelope,
    events,
    total: events.length,
    lanes: ["connexion", "ue_state", "rrc_state"],
    counts_by_lane: { connexion: 1, ue_state: 1, rrc_state: 1 },
    link_rule_counts: {},
    rule_version: null,
    unavailable: {},
    missing_time: 0,
  };
}

describe("signaling events schema", () => {
  it("accepte les intervalles d'état UE/RRC (lanes ue_state et rrc_state)", () => {
    const result = signalingSchemas.events.safeParse(
      payload([stateEvent("ue_state"), stateEvent("rrc_state")]),
    );
    expect(result.success).toBe(true);
  });

  it("accepte toujours les lanes canoniques existantes", () => {
    const result = signalingSchemas.events.safeParse(payload([stateEvent("connexion")]));
    expect(result.success).toBe(true);
  });
});
