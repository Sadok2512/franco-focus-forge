import type { ProvenState } from "./state-evidence";

/** Presentation of validated intervals, not a new evidence/reconstruction contract. */
export function statePresentation(state: ProvenState) {
  if (state.state === "IDLE")
    return {
      key: state.track === "RRC_STATE" ? "idleMode" : "idle",
      role: "idle",
      count: null,
      status: null,
    };
  const ca = state.componentCarriers !== null && state.componentCarriers > 1;
  // RRC State lane: Idle (gray) or Connected (blue) only — no LTE/NR/CC labels.
  if (state.track === "RRC_STATE") {
    return {
      key: "connected",
      role: "connected",
      count: null,
      status: null,
    };
  }
  const lte = state.technology === "LTE";
  return {
    key: ca ? (lte ? "lteCa" : "nrCa") : lte ? "lte" : "nr",
    role: ca ? (lte ? "lte-ca" : "nr-ca") : lte ? "lte" : "nr",
    count: state.componentCarriers,
    status: ca ? state.carrierStatus : null,
  };
}

/** Retain separately proven simultaneous LTE/NR without fabricating a combined CA mode. */
export function stateBandGeometry(state: ProvenState, states: ProvenState[]) {
  const simultaneous = states.some(
    (other) =>
      other !== state &&
      other.track === state.track &&
      (other.technology === "LTE") !== (state.technology === "LTE") &&
      other.startS < state.endS &&
      state.startS < other.endS,
  );
  return simultaneous
    ? { offset: state.technology === "LTE" ? -9 : 9, height: 16 }
    : { offset: 0, height: 34 };
}

/** 42 px state tracks with a 4 px gap; preserve every other track's 44 px pitch. */
export function stateLaneLayout(lanes: string[]) {
  let top = 0;
  const centers = lanes.map((lane) => {
    const state = lane === "uestate" || lane === "rrcstate";
    const center = top + (state ? 21 : 22);
    top += state ? 46 : 44;
    return center;
  });
  return { centers, height: top };
}

/** RRC State lane label: title only — the Idle badge was deleted at the user's request. */
export function rrcStateLaneLabel(title: string) {
  return `{title|${title}}`;
}

/** Lane gutter titles: both state lanes show their title with no badge. */
export function stateLaneTitle(
  lane: "uestate" | "rrcstate",
  labels: { ueState: string; rrcState: string },
): { title: string; badge: string | null } {
  return { title: lane === "uestate" ? labels.ueState : labels.rrcState, badge: null };
}
