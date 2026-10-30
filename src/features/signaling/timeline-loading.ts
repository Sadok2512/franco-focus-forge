import type { TimeWindow } from "./time-window";

/** Full capture uses the compact overview; event details start after zoom. */
export function shouldLoadTimelineDetail(
  overviewReady: boolean,
  duration: number,
  window: TimeWindow,
): boolean {
  return overviewReady && duration > 0 && window[1] - window[0] < duration - 0.001;
}
