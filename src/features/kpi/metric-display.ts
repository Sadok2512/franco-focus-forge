import { useSyncExternalStore } from "react";
import type { ExpressionSpecification } from "maplibre-gl";
import { beamPercent } from "./beam-display";

const KEY = "bc4.map.metricSize.v1";
const EVENT = "bc4:metric-size";
function readSize() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? 50 : beamPercent(Number(raw), 50);
  } catch { return 50; }
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
export function useMetricSize() {
  const size = useSyncExternalStore(subscribe, readSize, () => 50);
  return [size, (value: number) => {
    try { localStorage.setItem(KEY, String(beamPercent(value, 50))); } catch { return; }
    window.dispatchEvent(new Event(EVENT));
  }] as const;
}
export function metricRadius(size: number, selected = false, pulse = 0): ExpressionSpecification {
  const scale = beamPercent(size, 50) / 50;
  const extra = selected ? 3 + pulse * 2 : 0;
  return ["interpolate", ["linear"], ["zoom"], 9, 2 * scale + extra, 14, 4 * scale + extra, 18, 7 * scale + extra];
}