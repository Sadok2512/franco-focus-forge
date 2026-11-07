import { METRIC_COLORS, freeColor } from "./metric-styles";
import { normalizeUnit, type GraphSeries } from "./graph-series-drop";
import type { GraphAnalysisMode } from "./graph-distribution";

export type GraphAxisSide = "left" | "right";
export type GraphSeriesDisplay = "point" | "line" | "point-line";

export type ManagedGraphSeries = GraphSeries & {
  visible: boolean;
  axis: GraphAxisSide;
  display: GraphSeriesDisplay;
};

export type GraphAxisSettings = {
  auto: boolean;
  min: number | null;
  max: number | null;
  unit: string;
  color: string;
  visible: boolean;
};

export type GraphSeriesSettings = {
  series: ManagedGraphSeries[];
  axes: Record<GraphAxisSide, GraphAxisSettings>;
  analysisMode: GraphAnalysisMode;
};

const DEFAULT_AXIS_COLOR = "#64748b";

export function defaultAxisSettings(unit = ""): GraphAxisSettings {
  return { auto: true, min: null, max: null, unit, color: DEFAULT_AXIS_COLOR, visible: true };
}

export function graphAxisDomain(axis: GraphAxisSettings): [number | "auto", number | "auto"] {
  if (axis.auto) return ["auto", "auto"];
  const min = axis.min;
  const max = axis.max;
  if (min !== null && max !== null && min >= max) return ["auto", "auto"];
  return [min ?? "auto", max ?? "auto"];
}

export function graphSeriesSettingsKey(workspaceId: string | undefined, panelId: string): string {
  return `bc4.graph.series-management.v1.${workspaceId ?? "metrics"}.${panelId}`;
}

function validColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function parseAxis(value: unknown, fallback: GraphAxisSettings): GraphAxisSettings {
  if (!value || typeof value !== "object") return fallback;
  const item = value as Record<string, unknown>;
  return {
    auto: typeof item["auto"] === "boolean" ? item["auto"] : fallback.auto,
    min: typeof item["min"] === "number" && Number.isFinite(item["min"]) ? item["min"] : null,
    max: typeof item["max"] === "number" && Number.isFinite(item["max"]) ? item["max"] : null,
    unit: typeof item["unit"] === "string" ? item["unit"] : fallback.unit,
    color: validColor(item["color"]) ? item["color"] : fallback.color,
    visible: typeof item["visible"] === "boolean" ? item["visible"] : fallback.visible,
  };
}

export function readGraphSeriesSettings(
  workspaceId: string | undefined,
  panelId: string,
  displayName: (code: string, fallback: string) => string = (_code, fallback) => fallback,
): GraphSeriesSettings | null {
  try {
    const raw = localStorage.getItem(graphSeriesSettingsKey(workspaceId, panelId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const root = value as Record<string, unknown>;
    if (!Array.isArray(root["series"])) return null;
    const series = root["series"].flatMap((rawSeries): ManagedGraphSeries[] => {
      if (!rawSeries || typeof rawSeries !== "object") return [];
      const item = rawSeries as Record<string, unknown>;
      if (
        typeof item["code"] !== "string" ||
        typeof item["unit"] !== "string" ||
        !validColor(item["color"])
      )
        return [];
      return [
        {
          code: item["code"],
          label: displayName(
            item["code"],
            typeof item["label"] === "string" ? item["label"] : item["code"],
          ),
          unit: item["unit"],
          color: item["color"],
          visible: item["visible"] !== false,
          axis: item["axis"] === "right" ? "right" : "left",
          display:
            item["display"] === "line" || item["display"] === "point-line"
              ? item["display"]
              : "point",
        },
      ];
    });
    const axes =
      root["axes"] && typeof root["axes"] === "object"
        ? (root["axes"] as Record<string, unknown>)
        : {};
    return {
      series,
      analysisMode:
        root["analysisMode"] === "histogram" ||
        root["analysisMode"] === "cdf" ||
        root["analysisMode"] === "percentile"
          ? root["analysisMode"]
          : "timeline",
      axes: {
        left: parseAxis(axes["left"], defaultAxisSettings()),
        right: parseAxis(axes["right"], defaultAxisSettings()),
      },
    };
  } catch {
    return null;
  }
}

export function writeGraphSeriesSettings(
  workspaceId: string | undefined,
  panelId: string,
  settings: GraphSeriesSettings,
): void {
  try {
    localStorage.setItem(
      graphSeriesSettingsKey(workspaceId, panelId),
      JSON.stringify({
        ...settings,
        // Labels are deliberately not persisted: every restore resolves the
        // current catalogue display code from the canonical metric id.
        series: settings.series.map(({ label: _label, ...series }) => series),
      }),
    );
  } catch {
    /* mounted state remains authoritative when storage is unavailable */
  }
}

export function initialGraphSeriesSettings(
  base: GraphSeries,
  extras: GraphSeries[],
  hidden: readonly string[],
): GraphSeriesSettings {
  const all = [base, ...extras];
  const units: string[] = [];
  const series = all.map((item, index): ManagedGraphSeries => {
    const normalized = normalizeUnit(item.unit);
    if (!units.includes(normalized)) units.push(normalized);
    return {
      ...item,
      color: item.color || freeColor(all.slice(0, index).map((entry) => entry.color)),
      visible: !hidden.includes(item.code),
      axis: units.indexOf(normalized) === 1 ? "right" : "left",
      display: "point",
    };
  });
  return {
    series,
    analysisMode: "timeline",
    axes: {
      left: defaultAxisSettings(series.find((item) => item.axis === "left")?.unit ?? ""),
      right: defaultAxisSettings(series.find((item) => item.axis === "right")?.unit ?? ""),
    },
  };
}

export function addManagedSeries(
  settings: GraphSeriesSettings,
  added: Omit<GraphSeries, "color">,
): GraphSeriesSettings | null {
  if (settings.series.some((item) => item.code === added.code)) return null;
  const units = [...new Set(settings.series.map((item) => normalizeUnit(item.unit)))];
  const normalized = normalizeUnit(added.unit);
  if (!units.includes(normalized) && units.length >= 2) return null;
  const axis: GraphAxisSide =
    units.length === 1 && !units.includes(normalized)
      ? "right"
      : (settings.series.find((item) => normalizeUnit(item.unit) === normalized)?.axis ?? "left");
  const color = freeColor(settings.series.map((item) => item.color));
  return {
    ...settings,
    series: [...settings.series, { ...added, color, visible: true, axis, display: "point" }],
    axes: {
      ...settings.axes,
      [axis]: settings.axes[axis].unit
        ? settings.axes[axis]
        : { ...settings.axes[axis], unit: added.unit },
    },
  };
}

export function canAssignSeriesAxis(
  settings: GraphSeriesSettings,
  code: string,
  axis: GraphAxisSide,
): boolean {
  const target = settings.series.find((item) => item.code === code);
  if (!target) return false;
  return settings.series
    .filter((item) => item.code !== code && item.axis === axis)
    .every((item) => normalizeUnit(item.unit) === normalizeUnit(target.unit));
}

export function reorderManagedSeries(
  series: ManagedGraphSeries[],
  sourceCode: string,
  targetCode: string,
): ManagedGraphSeries[] {
  const source = series.findIndex((item) => item.code === sourceCode);
  const target = series.findIndex((item) => item.code === targetCode);
  if (source < 0 || target < 0 || source === target) return series;
  const next = [...series];
  const [moved] = next.splice(source, 1);
  next.splice(target, 0, moved!);
  return next;
}

export function resetSeriesColor(series: ManagedGraphSeries[], code: string): ManagedGraphSeries[] {
  const index = series.findIndex((item) => item.code === code);
  if (index < 0) return series;
  const used = series.filter((item) => item.code !== code).map((item) => item.color);
  return series.map((item) =>
    item.code === code
      ? {
          ...item,
          color:
            METRIC_COLORS[index] && !used.includes(METRIC_COLORS[index]!)
              ? METRIC_COLORS[index]!
              : freeColor(used),
        }
      : item,
  );
}
