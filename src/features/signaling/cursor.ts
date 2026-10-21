import type { RfEvent } from "@/lib/api/signaling";

export type TimelineCursorState = {
  selectedTimeS: number | null;
  hoveredTimeS: number | null;
  selectedEventId: string | null;
  selectedMessageSeq: number | null;
};
export const emptyCursor: TimelineCursorState = {
  selectedTimeS: null,
  hoveredTimeS: null,
  selectedEventId: null,
  selectedMessageSeq: null,
};
export type Observation = { t_rel_s: number; value: number | null; seq: number };

/** Input is chronologically sorted once, not scanned on every mouse movement. */
export function previousObservation(points: readonly Observation[], time: number) {
  let lo = 0,
    hi = points.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const point = points[mid];
    if (point && point.t_rel_s <= time) lo = mid + 1;
    else hi = mid;
  }
  // Null samples are unavailable, never substituted with zero.
  return points[lo - 1] ?? null;
}
export function availableTimes(events: readonly RfEvent[], points: readonly Observation[]) {
  return [
    ...new Set(
      [
        ...events.flatMap((e) => [e.t_rel_s, e.t_rel_end_s]),
        ...points.filter((p) => p.value !== null).map((p) => p.t_rel_s),
      ].filter((v): v is number => v !== null && Number.isFinite(v)),
    ),
  ].sort((a, b) => a - b);
}
export function stepTime(times: readonly number[], time: number | null, direction: -1 | 1) {
  if (time === null) return (direction === 1 ? times[0] : times.at(-1)) ?? null;
  return (
    (direction === 1 ? times.find((v) => v > time) : [...times].reverse().find((v) => v < time)) ??
    time
  );
}
export function activeIntervals(events: readonly RfEvent[], time: number) {
  return events.filter(
    (e) =>
      e.t_rel_s !== null &&
      e.t_rel_end_s !== null &&
      e.t_rel_end_s > e.t_rel_s &&
      e.t_rel_s <= time &&
      time <= e.t_rel_end_s &&
      e.attrs.evidence_status === "PROVEN",
  );
}
/** A pivot is admissible only when the API explicitly links it. */
export function eventMessage(event: RfEvent): number | null {
  if (event.pivot_seq !== null && event.linked_seqs.includes(event.pivot_seq))
    return event.pivot_seq;
  return event.linked_seqs[0] ?? null;
}
