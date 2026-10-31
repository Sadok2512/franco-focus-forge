import { useEffect, useState } from "react";
import { RSRP_CLASSES, isRsrpPointCode } from "./drive-rsrp";

/** Presentation-only colour classes for metric-card map points. */
export type MetricClass = { id: string; min: number; max: number; color: string };

/** User legend settings: number of classes (null = default) and colour overrides by index. */
export type MetricLegendSettings = { count: number | null; colors: Record<number, string> };
export const DEFAULT_LEGEND_SETTINGS: MetricLegendSettings = { count: null, colors: {} };
export const MIN_CLASSES = 2;
export const MAX_CLASSES = 8;

const RAMP = ["#16a34a", "#22c55e", "#84cc16", "#eab308", "#f59e0b", "#f97316", "#ea580c", "#dc2626"];

/** Evenly sampled colours from the green→red ramp. */
export function defaultPalette(count: number): string[] {
  if (count <= 1) return [RAMP[2]!];
  return Array.from({ length: count }, (_, i) => RAMP[Math.round((i * (RAMP.length - 1)) / (count - 1))]!);
}

export function metricClasses(
  code: string,
  values: number[],
  settings: MetricLegendSettings = DEFAULT_LEGEND_SETTINGS,
): MetricClass[] {
  const paint = (classes: MetricClass[]) =>
    classes.map((c, i) => ({ ...c, color: settings.colors[i] ?? c.color }));
  if (isRsrpPointCode(code) && settings.count === null) {
    return paint(
      [...RSRP_CLASSES]
        .map((c, i) => ({
          id: c.id,
          min: c.min,
          max: i === 0 ? Infinity : RSRP_CLASSES[i - 1]!.min,
          color: c.color,
        }))
        .reverse(),
    );
  }
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of finite) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const count = Math.min(MAX_CLASSES, Math.max(MIN_CLASSES, settings.count ?? 5));
  const palette = defaultPalette(count);
  if (lo === hi) return paint([{ id: "c0", min: -Infinity, max: Infinity, color: palette[0]! }]);
  const step = (hi - lo) / count;
  return paint(
    palette.map((color, i) => ({
      id: `c${i}`,
      min: i === 0 ? -Infinity : lo + step * i,
      max: i === count - 1 ? Infinity : lo + step * (i + 1),
      color,
    })),
  );
}

export function classOf(classes: MetricClass[], value: number): MetricClass | undefined {
  return classes.find((c) => value >= c.min && value < c.max);
}

const KEY = "bc4.map.metricLegend.v1";

/** Legend settings persisted per metric code. */
export function useMetricLegendSettings(code: string) {
  const [settings, setSettings] = useState<MetricLegendSettings>(DEFAULT_LEGEND_SETTINGS);
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, MetricLegendSettings>;
      setSettings({ ...DEFAULT_LEGEND_SETTINGS, ...all[code] });
    } catch {
      setSettings(DEFAULT_LEGEND_SETTINGS);
    }
  }, [code]);
  const save = (next: MetricLegendSettings) => {
    setSettings(next);
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, MetricLegendSettings>;
      localStorage.setItem(KEY, JSON.stringify({ ...all, [code]: next }));
    } catch {
      /* storage unavailable: keep in memory */
    }
  };
  return [settings, save] as const;
}
