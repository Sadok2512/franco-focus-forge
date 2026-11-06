import { useCallback, useEffect, useRef, useState } from "react";

export type TimeWindow = [number, number];
export const DEFAULT_WINDOW_S = 30;
// Sentinel width meaning "show the whole capture": clampWindow caps it at duration.
export const FULL_CAPTURE_S = Number.MAX_SAFE_INTEGER;
export function clampWindow(
  duration: number,
  requestedStart: number,
  width = DEFAULT_WINDOW_S,
): TimeWindow {
  const d = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const w = Math.min(d, Math.max(0, Number.isFinite(width) ? width : DEFAULT_WINDOW_S));
  const start = Math.min(Math.max(0, requestedStart), Math.max(0, d - w));
  return [start, Math.min(d, start + w)];
}
export function followMessage(
  window: TimeWindow,
  time: number | null,
  duration: number,
): TimeWindow {
  if (time === null || !Number.isFinite(time) || (time >= window[0] && time <= window[1]))
    return window;
  const width = window[1] - window[0];
  return clampWindow(duration, time - width / 2, width);
}
export function resizeWindow(
  window: TimeWindow,
  edge: "start" | "end",
  time: number,
  duration: number,
): TimeWindow {
  if (!Number.isFinite(time) || duration <= 0) return window;
  const minimum = Math.min(0.1, duration);
  return edge === "start"
    ? [Math.max(0, Math.min(time, window[1] - minimum)), window[1]]
    : [window[0], Math.min(duration, Math.max(time, window[0] + minimum))];
}
export function useTimeWindow(
  captureId: string | undefined,
  duration: number,
  defaultWidth = DEFAULT_WINDOW_S,
  persistenceKey?: string,
) {
  const storageKey = persistenceKey && captureId ? `${persistenceKey}.${captureId}` : undefined;
  const readRequest = useCallback(() => {
    if (!storageKey) return { start: 0, width: defaultWidth };
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as unknown;
      if (stored && typeof stored === "object") {
        const value = stored as Record<string, unknown>;
        if (typeof value["start"] === "number" && typeof value["width"] === "number")
          return { start: value["start"], width: value["width"] };
      }
    } catch {
      /* persistence unavailable */
    }
    return { start: 0, width: defaultWidth };
  }, [defaultWidth, storageKey]);
  const [request, setRequest] = useState(readRequest);
  const hydrated = useRef(false);
  useEffect(() => {
    hydrated.current = false;
    setRequest(readRequest());
    hydrated.current = true;
  }, [captureId, readRequest]);
  useEffect(() => {
    if (!storageKey || !hydrated.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(request));
    } catch {
      /* persistence unavailable */
    }
  }, [request, storageKey]);
  const window = clampWindow(duration, request.start, request.width);
  const setWindow = useCallback((next: TimeWindow) => {
    setRequest({ start: next[0], width: next[1] - next[0] });
  }, []);
  return { window, setWindow };
}
