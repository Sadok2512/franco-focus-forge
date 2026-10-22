import type { ProvenState } from "./state-evidence";

export type RrcStateSegment = {
  id: string;
  state: "CONNECTED" | "IDLE" | "UNKNOWN";
  startS: number;
  endS: number;
  proof: ProvenState | null;
  roundStart: boolean;
  roundEnd: boolean;
};

/**
 * Presents supplied RRC evidence on the complete, bounded capture axis.
 * Gaps become UNKNOWN; this function never reconstructs or infers IDLE.
 */
export function rrcStateSegments(states: ProvenState[], durationS: number): RrcStateSegment[] {
  if (!Number.isFinite(durationS) || durationS <= 0) return [];

  const proven = states
    .filter(
      (state) =>
        state.track === "RRC_STATE" &&
        (state.state === "CONNECTED" || state.state === "IDLE") &&
        state.startS < durationS &&
        state.endS > 0,
    )
    .map((state) => ({
      state,
      startS: Math.max(0, state.startS),
      endS: Math.min(durationS, state.endS),
    }))
    .filter((state) => state.endS > state.startS)
    .sort((a, b) => a.startS - b.startS || a.endS - b.endS);

  const result: Omit<RrcStateSegment, "roundStart" | "roundEnd">[] = [];
  let cursor = 0;
  for (const item of proven) {
    if (item.startS > cursor) {
      result.push({
        id: `rrc-unknown:${cursor}:${item.startS}`,
        state: "UNKNOWN",
        startS: cursor,
        endS: item.startS,
        proof: null,
      });
    }
    result.push({
      id: `rrc-${item.state.event.id}`,
      state: item.state.state === "IDLE" ? "IDLE" : "CONNECTED",
      startS: item.startS,
      endS: item.endS,
      proof: item.state,
    });
    cursor = Math.max(cursor, item.endS);
  }
  if (cursor < durationS) {
    result.push({
      id: `rrc-unknown:${cursor}:${durationS}`,
      state: "UNKNOWN",
      startS: cursor,
      endS: durationS,
      proof: null,
    });
  }

  return result.map((segment, index) => ({
    ...segment,
    roundStart: index === 0,
    roundEnd: index === result.length - 1,
  }));
}
