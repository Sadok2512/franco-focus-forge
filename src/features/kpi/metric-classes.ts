import { RSRP_CLASSES, isRsrpPointCode } from "./drive-rsrp";

/** Presentation-only colour classes for metric-card map points. */
export type MetricClass = { id: string; min: number; max: number; color: string };

const PALETTE = ["#2563eb", "#06b6d4", "#84cc16", "#f59e0b", "#dc2626"];

export function metricClasses(code: string, values: number[]): MetricClass[] {
  if (isRsrpPointCode(code)) {
    return RSRP_CLASSES.map((c, i) => ({
      id: c.id,
      min: c.min,
      max: i === 0 ? Infinity : RSRP_CLASSES[i - 1]!.min,
      color: c.color,
    }));
  }
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [];
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  if (lo === hi) return [{ id: "c0", min: lo, max: Infinity, color: PALETTE[2]! }];
  const step = (hi - lo) / PALETTE.length;
  return PALETTE.map((color, i) => ({
    id: `c${i}`,
    min: i === 0 ? -Infinity : lo + step * i,
    max: i === PALETTE.length - 1 ? Infinity : lo + step * (i + 1),
    color,
  }));
}

export function classOf(classes: MetricClass[], value: number): MetricClass | undefined {
  return classes.find((c) => value >= c.min && value < c.max);
}
