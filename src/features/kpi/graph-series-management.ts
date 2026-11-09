import { METRIC_COLORS, freeColor } from "./metric-styles";

/** Recharts otherwise renders a default active dot while hovering a Line,
 * even when its persistent dots are disabled. */
export const GRAPH_LINE_MARKERS = { dot: false, activeDot: false } as const;
import { normalizeUnit, type GraphSeries } from "./graph-series-drop";
import {
  DEFAULT_DISTRIBUTION_SETTINGS,
  type DistributionSettings,
  type GraphAnalysisMode,
} from "./graph-distribution";

export type GraphAxisSide = "left" | "right";
export type GraphSeriesDisplay = "point" | "line" | "bar" | "point-line";

export type ManagedGraphSeries = GraphSeries & {
  visible: boolean;
  axis: GraphAxisSide;
  display: GraphSeriesDisplay;
  lineWidth: number;
  markerSize: number;
};

export const DEFAULT_GRAPH_LINE_WIDTH = 2;
export const DEFAULT_GRAPH_MARKER_SIZE = 6;

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
  distribution: DistributionSettings;
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

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

function parseDistribution(value: unknown, legacyMode: GraphAnalysisMode): DistributionSettings {
  const fallback: DistributionSettings = {
    ...DEFAULT_DISTRIBUTION_SETTINGS,
    modes: {
      histogram: legacyMode === "histogram",
      cdf: legacyMode === "cdf",
      percentile: legacyMode === "percentile",
    },
    range: { ...DEFAULT_DISTRIBUTION_SETTINGS.range },
    bins: { ...DEFAULT_DISTRIBUTION_SETTINGS.bins },
    histogram: { ...DEFAULT_DISTRIBUTION_SETTINGS.histogram },
    cdf: { ...DEFAULT_DISTRIBUTION_SETTINGS.cdf },
    percentiles: { ...DEFAULT_DISTRIBUTION_SETTINGS.percentiles },
  };
  if (!value || typeof value !== "object") return fallback;
  const root = value as Record<string, unknown>;
  const modes =
    root["modes"] && typeof root["modes"] === "object"
      ? (root["modes"] as Record<string, unknown>)
      : {};
  const range =
    root["range"] && typeof root["range"] === "object"
      ? (root["range"] as Record<string, unknown>)
      : {};
  const bins =
    root["bins"] && typeof root["bins"] === "object"
      ? (root["bins"] as Record<string, unknown>)
      : {};
  const histogram =
    root["histogram"] && typeof root["histogram"] === "object"
      ? (root["histogram"] as Record<string, unknown>)
      : {};
  const cdf =
    root["cdf"] && typeof root["cdf"] === "object" ? (root["cdf"] as Record<string, unknown>) : {};
  const percentiles =
    root["percentiles"] && typeof root["percentiles"] === "object"
      ? (root["percentiles"] as Record<string, unknown>)
      : {};
  const percentileValues = Array.isArray(percentiles["values"])
    ? [
        ...new Set(
          percentiles["values"].filter(
            (item): item is number =>
              typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 100,
          ),
        ),
      ].sort((a, b) => a - b)
    : fallback.percentiles.values;
  return {
    modes: {
      histogram: modes["histogram"] === true,
      cdf: modes["cdf"] === true,
      percentile: modes["percentile"] === true,
    },
    range: {
      auto: range["auto"] !== false,
      min: typeof range["min"] === "number" && Number.isFinite(range["min"]) ? range["min"] : null,
      max: typeof range["max"] === "number" && Number.isFinite(range["max"]) ? range["max"] : null,
    },
    bins: {
      mode: bins["mode"] === "width" || bins["mode"] === "count" ? bins["mode"] : "auto",
      width: Math.max(0.000001, finite(bins["width"], fallback.bins.width)),
      count: Math.max(1, Math.min(200, Math.round(finite(bins["count"], fallback.bins.count)))),
    },
    histogram: {
      yMode: histogram["yMode"] === "percentage" ? "percentage" : "count",
      color: validColor(histogram["color"]) ? histogram["color"] : fallback.histogram.color,
      opacity: Math.max(0.1, Math.min(1, finite(histogram["opacity"], fallback.histogram.opacity))),
    },
    cdf: {
      direction: cdf["direction"] === "ccdf" ? "ccdf" : "cdf",
      color: validColor(cdf["color"]) ? cdf["color"] : fallback.cdf.color,
      width: Math.max(1, Math.min(6, finite(cdf["width"], fallback.cdf.width))),
    },
    percentiles: {
      values: percentileValues.length ? percentileValues : fallback.percentiles.values,
      // 1.148.3 briefly used red for both guides and percentile data. Migrate
      // that exact legacy default to the certified green curve; preserve every
      // other workspace-selected colour.
      color:
        validColor(percentiles["color"]) &&
        !(percentiles["color"].toLowerCase() === "#dc2626" && percentiles["width"] === undefined)
          ? percentiles["color"]
          : fallback.percentiles.color,
      width: Math.max(1, Math.min(6, finite(percentiles["width"], fallback.percentiles.width))),
      showLines:
        typeof percentiles["showLines"] === "boolean"
          ? percentiles["showLines"]
          : fallback.percentiles.showLines,
      showMarkers:
        typeof percentiles["showMarkers"] === "boolean"
          ? percentiles["showMarkers"]
          : fallback.percentiles.showMarkers,
      showLabels:
        typeof percentiles["showLabels"] === "boolean"
          ? percentiles["showLabels"]
          : fallback.percentiles.showLabels,
    },
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
            item["display"] === "line" ||
            item["display"] === "bar" ||
            item["display"] === "point-line"
              ? item["display"]
              : "point",
          lineWidth: Math.max(1, Math.min(8, finite(item["lineWidth"], DEFAULT_GRAPH_LINE_WIDTH))),
          markerSize: Math.max(
            2,
            Math.min(20, finite(item["markerSize"], DEFAULT_GRAPH_MARKER_SIZE)),
          ),
        },
      ];
    });
    const axes =
      root["axes"] && typeof root["axes"] === "object"
        ? (root["axes"] as Record<string, unknown>)
        : {};
    const analysisMode =
      root["analysisMode"] === "histogram" ||
      root["analysisMode"] === "cdf" ||
      root["analysisMode"] === "percentile"
        ? root["analysisMode"]
        : "timeline";
    return {
      series,
      analysisMode,
      distribution: parseDistribution(root["distribution"], analysisMode),
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
      display: "line",
      lineWidth: DEFAULT_GRAPH_LINE_WIDTH,
      markerSize: DEFAULT_GRAPH_MARKER_SIZE,
    };
  });
  return {
    series,
    analysisMode: "timeline",
    distribution: {
      ...DEFAULT_DISTRIBUTION_SETTINGS,
      // A regular Graph opens on its time series. Histogram remains the
      // default when a statistical view is explicitly requested.
      modes: { histogram: false, cdf: false, percentile: false },
      range: { ...DEFAULT_DISTRIBUTION_SETTINGS.range },
      bins: { ...DEFAULT_DISTRIBUTION_SETTINGS.bins },
      histogram: { ...DEFAULT_DISTRIBUTION_SETTINGS.histogram },
      cdf: { ...DEFAULT_DISTRIBUTION_SETTINGS.cdf },
      percentiles: { ...DEFAULT_DISTRIBUTION_SETTINGS.percentiles },
    },
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
    series: [
      ...settings.series,
      {
        ...added,
        color,
        visible: true,
        axis,
        display: "line",
        lineWidth: DEFAULT_GRAPH_LINE_WIDTH,
        markerSize: DEFAULT_GRAPH_MARKER_SIZE,
      },
    ],
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
