import { useEffect, useState } from "react";
import { RSRP_CLASSES, isRsrpPointCode } from "./drive-rsrp";

/** Presentation-only colour classes for metric-card map points. */
export type MetricClass = { id: string; min: number; max: number; color: string };

/** Presentation-only settings. They never alter the metric query or its values. */
export type MetricLegendSettings = {
  count: number | null;
  colors: Record<number, string>;
  mode: "auto" | "custom";
  min: number | null;
  max: number | null;
  thresholds: number[];
  showCount: boolean;
  showPercent: boolean;
  gradient: boolean;
};
export const DEFAULT_LEGEND_SETTINGS: MetricLegendSettings = {
  count: null,
  colors: {},
  mode: "auto",
  min: null,
  max: null,
  thresholds: [],
  showCount: true,
  showPercent: true,
  gradient: true,
};
export type MetricLegendPresentation = {
  expanded: boolean;
  visible: boolean;
  hidden: string[];
};
const DEFAULT_PRESENTATION: MetricLegendPresentation = {
  expanded: true,
  visible: true,
  hidden: [],
};
export const MIN_CLASSES = 2;
export const MAX_CLASSES = 8;

const RAMP = [
  "#16a34a",
  "#22c55e",
  "#84cc16",
  "#eab308",
  "#f59e0b",
  "#f97316",
  "#ea580c",
  "#dc2626",
];

/** Evenly sampled colours from the green→red ramp. */
export function defaultPalette(count: number): string[] {
  if (count <= 1) return [RAMP[2]!];
  return Array.from(
    { length: count },
    (_, i) => RAMP[Math.round((i * (RAMP.length - 1)) / (count - 1))]!,
  );
}

export function metricClasses(
  code: string,
  values: number[],
  inputSettings: Partial<MetricLegendSettings> = DEFAULT_LEGEND_SETTINGS,
): MetricClass[] {
  const settings = normaliseSettings(inputSettings);
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
  const customThresholds = [...new Set(settings.thresholds.filter(Number.isFinite))].sort(
    (a, b) => a - b,
  );
  if (settings.mode === "custom" && customThresholds.length) {
    const palette = defaultPalette(customThresholds.length + 1);
    return paint(
      palette.map((color, i) => ({
        id: `c${i}`,
        min: i === 0 ? -Infinity : customThresholds[i - 1]!,
        max: i === customThresholds.length ? Infinity : customThresholds[i]!,
        color,
      })),
    );
  }
  lo = settings.min ?? lo;
  hi = settings.max ?? hi;
  if (lo > hi) [lo, hi] = [hi, lo];
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

const KEY = "bc4.map.metricLegend.v2";
const LEGACY_KEY = "bc4.map.metricLegend.v1";
const PRESENTATION_KEY = "bc4.map.metricLegendPresentation.v1";
const storageId = (code: string, scope?: string) => (scope ? `${scope}::${code}` : code);

function normaliseSettings(value?: Partial<MetricLegendSettings>): MetricLegendSettings {
  return {
    ...DEFAULT_LEGEND_SETTINGS,
    ...value,
    colors: { ...(value?.colors ?? {}) },
    thresholds: Array.isArray(value?.thresholds) ? value.thresholds.filter(Number.isFinite) : [],
  };
}

export function readMetricLegendSettings(code: string, scope?: string): MetricLegendSettings {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
      string,
      MetricLegendSettings
    >;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}") as Record<
      string,
      MetricLegendSettings
    >;
    return normaliseSettings(all[storageId(code, scope)] ?? all[code] ?? legacy[code]);
  } catch {
    return DEFAULT_LEGEND_SETTINGS;
  }
}

export function writeMetricLegendSettings(
  code: string,
  input: Partial<MetricLegendSettings>,
  scope?: string,
) {
  const next = normaliseSettings(input);
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
      string,
      MetricLegendSettings
    >;
    localStorage.setItem(KEY, JSON.stringify({ ...all, [storageId(code, scope)]: next }));
  } catch {
    /* storage unavailable: caller retains its in-memory value */
  }
  window.dispatchEvent(
    new CustomEvent("bc4-metric-legend-settings", { detail: storageId(code, scope) }),
  );
}

/** Legend settings persisted per metric code. */
export function useMetricLegendSettings(code: string, scope?: string) {
  const [settings, setSettings] = useState<MetricLegendSettings>(() =>
    readMetricLegendSettings(code, scope),
  );
  useEffect(() => {
    setSettings(readMetricLegendSettings(code, scope));
    const onChange = (event: Event) => {
      if ((event as CustomEvent).detail === storageId(code, scope))
        setSettings(readMetricLegendSettings(code, scope));
    };
    window.addEventListener("bc4-metric-legend-settings", onChange);
    return () => window.removeEventListener("bc4-metric-legend-settings", onChange);
  }, [code, scope]);
  const save = (next: MetricLegendSettings) => {
    setSettings(next);
    writeMetricLegendSettings(code, next, scope);
  };
  return [settings, save] as const;
}

/** Expanded/visible/range-filter state, isolated per map panel in a workspace. */
export function useMetricLegendPresentation(scope: string, code: string) {
  const id = storageId(code, scope);
  const read = (): MetricLegendPresentation => {
    try {
      const all = JSON.parse(localStorage.getItem(PRESENTATION_KEY) ?? "{}") as Record<
        string,
        Partial<MetricLegendPresentation>
      >;
      return { ...DEFAULT_PRESENTATION, ...all[id], hidden: [...(all[id]?.hidden ?? [])] };
    } catch {
      return DEFAULT_PRESENTATION;
    }
  };
  const [value, setValue] = useState<MetricLegendPresentation>(read);
  const save = (next: MetricLegendPresentation) => {
    setValue(next);
    try {
      const all = JSON.parse(localStorage.getItem(PRESENTATION_KEY) ?? "{}") as Record<
        string,
        MetricLegendPresentation
      >;
      localStorage.setItem(PRESENTATION_KEY, JSON.stringify({ ...all, [id]: next }));
    } catch {
      /* Memory-only fallback. */
    }
  };
  useEffect(() => {
    setValue(read());
    const expand = (event: Event) => {
      const detail = (event as CustomEvent<{ scope: string; expanded: boolean }>).detail;
      if (detail?.scope !== scope) return;
      setValue((current) => {
        const next = { ...current, expanded: detail.expanded };
        try {
          const all = JSON.parse(localStorage.getItem(PRESENTATION_KEY) ?? "{}") as Record<
            string,
            MetricLegendPresentation
          >;
          localStorage.setItem(PRESENTATION_KEY, JSON.stringify({ ...all, [id]: next }));
        } catch {
          /* Memory-only fallback. */
        }
        return next;
      });
    };
    window.addEventListener("bc4-map-legend-expand", expand);
    return () => window.removeEventListener("bc4-map-legend-expand", expand);
    // `read` is deliberately scoped to the stable storage identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, scope]);
  return [value, save] as const;
}
