import type { TimeWindow } from "./time-window";

/** Full capture uses the compact overview; event details start after zoom. */
export function shouldLoadTimelineDetail(
  overviewReady: boolean,
  duration: number,
  window: TimeWindow,
): boolean {
  return overviewReady && duration > 0 && window[1] - window[0] < duration - 0.001;
}

/** Keep lightweight overview intervals visible, then replace duplicates with detail rows. */
export function mergeTimelineEvents<T extends { id: string }>(
  stateEvents: T[],
  taskEvents: T[],
  detailEvents: T[],
): T[] {
  const merged = new Map<string, T>();
  for (const event of [...stateEvents, ...taskEvents, ...detailEvents]) merged.set(event.id, event);
  return [...merged.values()];
}
