// One plot geometry for SVG tracks, radio canvas and the continuous cursor.
export const TIMELINE_WIDTH = 1000;
export const TIMELINE_LABEL_WIDTH = 132;
export const TIMELINE_RIGHT = 8;
export const TIMELINE_LANE_WIDTH = TIMELINE_WIDTH - TIMELINE_LABEL_WIDTH - TIMELINE_RIGHT;

export function timeFraction(t: number, start: number, end: number): number {
  return (TIMELINE_LABEL_WIDTH + ((t - start) / Math.max(end - start, 1e-6)) * TIMELINE_LANE_WIDTH) / TIMELINE_WIDTH;
}

export function timeAtClientX(x: number, left: number, width: number, start: number, end: number): number {
  if (width <= 0) return start;
  const fraction = (x - left) / width;
  const lane = Math.min(1, Math.max(0, (fraction * TIMELINE_WIDTH - TIMELINE_LABEL_WIDTH) / TIMELINE_LANE_WIDTH));
  return start + lane * (end - start);
}