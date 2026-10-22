import { useCallback, useEffect, useState } from "react";

export type TimeWindow = [number, number];
export const DEFAULT_WINDOW_S = 30;
export function clampWindow(duration: number, requestedStart: number, width = DEFAULT_WINDOW_S): TimeWindow {
  const d = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const w = Math.min(d, Math.max(0, Number.isFinite(width) ? width : DEFAULT_WINDOW_S));
  const start = Math.min(Math.max(0, requestedStart), Math.max(0, d - w));
  return [start, Math.min(d, start + w)];
}
export function followMessage(window: TimeWindow, time: number | null, duration: number): TimeWindow {
  if (time === null || !Number.isFinite(time) || (time >= window[0] && time <= window[1])) return window;
  const width = window[1] - window[0];
  return clampWindow(duration, time - width / 2, width);
}
export function useTimeWindow(captureId: string | undefined, duration: number) {
  const [request, setRequest] = useState({ start: 0, width: DEFAULT_WINDOW_S });
  useEffect(() => setRequest({ start: 0, width: DEFAULT_WINDOW_S }), [captureId]);
  const window = clampWindow(duration, request.start, request.width);
  const setWindow = useCallback((next: TimeWindow) => {
    setRequest({ start: next[0], width: next[1] - next[0] });
  }, []);
  return { window, setWindow };
}