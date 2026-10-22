import type { ProvenState } from "./state-evidence";

/** Presentation of validated intervals, not a new evidence/reconstruction contract. */
export function statePresentation(state: ProvenState) {
  if (state.state === "IDLE")
    return { key: state.track === "RRC_STATE" ? "idleMode" : "idle", role: "idle", count: null, status: null };
  const ca = state.componentCarriers !== null && state.componentCarriers > 1;
  if (state.track === "RRC_STATE") {
    // NR technology alone is not proof of ENDC success or an SA context.
    if (state.technology !== "LTE") return null;
    const activeCa = ca && (state.carrierStatus === "ACTIVATED" || state.carrierStatus === "USED");
    return { key: activeCa ? "lteAdvanced" : "lte", role: activeCa ? "lte-ca" : "lte", count: null, status: null };
  }
  const lte = state.technology === "LTE";
  return {
    key: ca ? lte ? "lteCa" : "nrCa" : lte ? "lte" : "nr",
    role: ca ? lte ? "lte-ca" : "nr-ca" : lte ? "lte" : "nr",
    count: state.componentCarriers,
    status: ca ? state.carrierStatus : null,
  };
}

/** Retain separately proven simultaneous LTE/NR without fabricating a combined CA mode. */
export function stateBandGeometry(state: ProvenState, states: ProvenState[]) {
  const simultaneous = states.some(other => other !== state && other.track === state.track &&
    (other.technology === "LTE") !== (state.technology === "LTE") &&
    other.startS < state.endS && state.startS < other.endS);
  return simultaneous
    ? { offset: state.technology === "LTE" ? -9 : 9, height: 16 }
    : { offset: 0, height: 34 };
}