import type { RfEvent } from "@/lib/api/signaling";

export type StateTrack = "UE_STATE" | "RRC_STATE";
export type ProvenState = {
  event: RfEvent;
  track: StateTrack;
  captureId: string;
  sessionId: string;
  technology: "LTE" | "NR_NSA" | "NR_SA";
  state: "IDLE" | "LTE" | "NR" | "CONNECTED";
  startS: number;
  endS: number;
  componentCarriers: number | null;
  carrierStatus: "CONFIGURED" | "ACTIVATED" | "USED" | null;
  evidenceSeqs: number[];
};

export function stateTrack(event: RfEvent): StateTrack | null {
  const track = event.attrs.track?.toUpperCase();
  if (track === "RRC_STATE") return "RRC_STATE";
  if (["UE_STATE", "LTE", "NSA", "SA"].includes(track ?? "")) return "UE_STATE";
  return null;
}

/** Validates supplied intervals only. No message pairing or state reconstruction. */
export function provenState(event: RfEvent, captureId: string): ProvenState | null {
  const track = stateTrack(event);
  const a = event.attrs;
  const start = event.t_rel_s;
  const end = event.t_rel_end_s;
  const technology = a.technology;
  const seqs = a.source_seqs;
  const context = lteConnectedContext(event, captureId);
  if (a.rule_id === LTE_CONNECTED_RULE && !context) return null;
  const session = context ?? a["session_id"];
  const state = context
    ? track === "RRC_STATE" ? "CONNECTED" : "LTE"
    : typeof a["state"] === "string"
      ? a["state"].toUpperCase()
      : "";
  if (
    !track ||
    !captureId ||
    a.evidence_status !== "PROVEN" ||
    typeof session !== "string" ||
    !session.trim() ||
    (a["capture_id"] !== undefined && a["capture_id"] !== captureId) ||
    !["LTE", "NR_NSA", "NR_SA"].includes(technology ?? "") ||
    start === null ||
    end === null ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    event.seq_end === null ||
    !seqs ||
    !seqs.every((seq) => Number.isInteger(seq) && seq >= 0) ||
    !seqs.includes(event.seq) ||
    !seqs.includes(event.seq_end) ||
    event.seq === event.seq_end ||
    !a.rule_id ||
    !a.rule_version ||
    !(track === "RRC_STATE" ? ["IDLE", "CONNECTED"] : ["IDLE", "LTE", "NR"]).includes(state) ||
    (track === "UE_STATE" &&
      ((state === "LTE" && technology !== "LTE") || (state === "NR" && technology === "LTE")))
  )
    return null;
  if (technology !== "LTE" && technology !== "NR_NSA" && technology !== "NR_SA") return null;
  if (state !== "IDLE" && state !== "CONNECTED" && state !== "LTE" && state !== "NR") return null;
  const count = a["component_carriers"];
  const status = a["carrier_status"];
  const validCarriers =
    typeof count === "number" &&
    Number.isInteger(count) &&
    count > 0 &&
    (status === "CONFIGURED" || status === "ACTIVATED" || status === "USED") &&
    a["carrier_definition"] === "COMPONENT_CARRIERS" &&
    a["ca_evidence_status"] === "PROVEN";
  return {
    event,
    track,
    captureId,
    sessionId: session,
    technology,
    state,
    startS: start,
    endS: end,
    componentCarriers: validCarriers ? count : null,
    carrierStatus:
      validCarriers && (status === "CONFIGURED" || status === "ACTIVATED" || status === "USED")
        ? status
        : null,
    evidenceSeqs: [...new Set(seqs)],
  };
}

export const LTE_CONNECTED_RULE = "nemo_context_connected";

/**
 * Approved exception: context_id stands in for a session only for LTE Connected,
 * scoped by the composite (capture_id, context_id), with the full RRA -> RRC -> RRD
 * evidence chain. Returns the composite session key or null.
 */
function lteConnectedContext(event: RfEvent, captureId: string): string | null {
  const a = event.attrs;
  const track = stateTrack(event);
  const suppliedState = a["state"];
  // bc4-back ≥ 0.74.8 exposes context_id/session_id at event root; attrs kept as fallback.
  const context = event.context_id ?? a["context_id"];
  const seqs = a.source_seqs;
  if (
    a.rule_id !== LTE_CONNECTED_RULE ||
    a.evidence_status !== "PROVEN" ||
    a.technology !== "LTE" ||
    (track !== "UE_STATE" && track !== "RRC_STATE") ||
    (track === "RRC_STATE" && suppliedState !== "CONNECTED") ||
    (track === "UE_STATE" && suppliedState !== undefined && suppliedState !== "LTE") ||
    a["capture_id"] !== captureId ||
    (typeof context !== "string" && typeof context !== "number") ||
    !String(context).trim() ||
    !seqs ||
    seqs.length !== 3 ||
    event.seq_end === null ||
    // RF view uses the RRC pivot as seq; legacy uses the opening RRA.
    // Both retain the complete ordered RRA -> RRC -> RRD source chain.
    (seqs[0] !== event.seq && seqs[1] !== event.seq) ||
    seqs[2] !== event.seq_end ||
    !seqs.every((seq) => Number.isInteger(seq) && seq >= 0)
  )
    return null;
  const [requestSeq, connectedSeq, releaseSeq] = seqs;
  if (
    requestSeq === undefined || connectedSeq === undefined || releaseSeq === undefined ||
    !(requestSeq < connectedSeq && connectedSeq < releaseSeq)
  ) return null;
  const composite = `context:${captureId}:${String(context)}`;
  // A supplied session_id must agree with the composite (capture_id, context_id).
  if (event.session_id != null && event.session_id !== composite) return null;
  return composite;
}

export function provenStates(events: RfEvent[], captureId: string): ProvenState[] {
  const states = events.flatMap((event) => {
    const state = provenState(event, captureId);
    return state ? [state] : [];
  });
  // Ambiguous overlapping sessions/contradictory states cannot occupy one asserted band.
  // LTE and NR remain independent: EN-DC coexistence is not a conflict.
  return states.filter(
    (state) =>
      !states.some(
        (other) =>
          other !== state &&
          other.track === state.track &&
          (other.technology === "LTE") === (state.technology === "LTE") &&
          other.startS < state.endS &&
          state.startS < other.endS &&
          (other.sessionId !== state.sessionId || other.state !== state.state),
      ),
  );
}

export function stateLabelKey(state: ProvenState): string {
  if (state.state === "IDLE") return "signalingV2.idle";
  if (state.state === "CONNECTED") return "signalingV2.connected";
  if (state.state === "LTE" && state.componentCarriers === 4) return "signalingV2.lte4";
  if (state.state === "NR" && state.componentCarriers === 2) return "signalingV2.nr2";
  return state.state === "LTE" ? "signalingV2.lte" : "signalingV2.nr";
}
