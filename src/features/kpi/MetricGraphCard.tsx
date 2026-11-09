import { formatNumber } from "@/lib/i18n";
import { ChartSpinner } from "./ChartSpinner";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ECharts, EChartsOption } from "echarts";
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  ChartNoAxesCombined,
  CircleDot,
  Eye,
  EyeOff,
  MapPin,
  Maximize2,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Table2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { MAP_METRIC_MIME, readMapMetric } from "./map-metric-drop";
import { normalizeUnit, readHiddenGraphSeries, readGraphSeries } from "./graph-series-drop";
import {
  addManagedSeries,
  canAssignSeriesAxis,
  defaultAxisSettings,
  GRAPH_LINE_MARKERS,
  graphAxisDomain,
  initialGraphSeriesSettings,
  readGraphSeriesSettings,
  writeGraphSeriesSettings,
  type GraphAxisSide,
  type GraphAxisSettings,
  type GraphSeriesDisplay,
  type GraphSeriesSettings,
  type ManagedGraphSeries,
} from "./graph-series-management";
import {
  DEFAULT_METRIC_STYLE,
  METRIC_COLORS,
  METRIC_PLOTS,
  type MetricPlot,
  type MetricStyle,
} from "./metric-styles";

const METRIC_PLOT_ICONS: Record<MetricPlot, typeof BarChart3> = {
  line: TrendingUp,
  bar: BarChart3,
  point: CircleDot,
};
import { WorkspacePanelMenu } from "./WorkspacePanelMenu";
import { SharePanelMenuItem } from "./SharePanelMenuItem";
import { QueryErrorState } from "./QueryErrorState";
import { useActiveEvents } from "./active-events";
import { usePanelTableSettings } from "./table-settings";
import { getMetricAggregate, getMetricCaptures, getMetricSeries } from "@/lib/api/metrics";
import { API_LEAN_STALE_MS, metricCapturesKey } from "./query-keys";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import type { ChronogramData } from "@/lib/api/metrics-schemas";
import { operatorColor } from "./workspace-model";
import {
  effectiveTimeAxisMode,
  formatTick as formatTimeTick,
  timeAxisMetaFromPayload,
  tooltipTriple,
  type TimeAxisMeta,
  type TimeAxisMode,
} from "./time-axis";
import { usePointSync } from "./point-sync";
import { parseMetricSelection } from "./metric-selection";
import {
  cdfPoints,
  filterDistributionValues,
  formatDistributionTick,
  histogramResult,
  normalizeDistributionModes,
  quantile,
  percentilePoints,
  toggleDistributionMode,
  type DistributionSettings,
  type GraphAnalysisMode,
} from "./graph-distribution";

const KPI_SERIES_RENDER_DEBUG = import.meta.env["VITE_KPI_SERIES_RENDER_DEBUG"] === "1";

export type MetricZoomWindow = { startIndex: number; endIndex: number };

export function normalizeMetricZoom(
  zoom: MetricZoomWindow | null,
  rowCount: number,
): MetricZoomWindow | null {
  if (!zoom || rowCount < 2) return null;
  const startIndex = Math.max(0, Math.min(rowCount - 1, Math.floor(zoom.startIndex)));
  const endIndex = Math.max(startIndex, Math.min(rowCount - 1, Math.floor(zoom.endIndex)));
  return startIndex === 0 && endIndex === rowCount - 1 ? null : { startIndex, endIndex };
}

export function metricZoomDomain(
  rows: Array<{ t_rel_s: number }>,
  zoom: MetricZoomWindow | null,
): [number, number] {
  const normalized = normalizeMetricZoom(zoom, rows.length);
  const first = rows[normalized?.startIndex ?? 0]?.t_rel_s ?? 0;
  const last = rows[normalized?.endIndex ?? Math.max(0, rows.length - 1)]?.t_rel_s ?? first;
  return first === last ? [first, first + 1] : [first, last];
}

export function metricZoomStorageKey(workspaceId: string | undefined, panelId: string) {
  return `bc4.metric-zoom.v1.${workspaceId ?? "metrics"}.${panelId}`;
}

export type MetricNumericPoint = {
  seq: number;
  t_rel_s: number;
  value: number;
};

export type MetricPlotPoint = {
  seq: number;
  t_rel_s: number;
  value: number | null;
};

/** Keep each API series independent. Merging them into one sparse row set
 * inserts false nulls at every sample owned by another metric; Recharts then
 * breaks a line into tiny strokes when connectNulls=false. */
export function sortedMetricPoints<T extends { t_rel_s: number; seq: number }>(
  points: readonly T[],
): T[] {
  return [...points].sort((a, b) => a.t_rel_s - b.t_rel_s || a.seq - b.seq);
}

export function metricSeriesRenderMode(
  requested: MetricPlot,
  _points: readonly MetricNumericPoint[],
): MetricPlot {
  // The selected presentation remains authoritative. Duplicate timestamps
  // are segmented in metricSeriesPlotPoints instead of silently changing a
  // checked Line option into a point plot.
  return requested;
}

/** Break a continuous line across a real acquisition gap without dropping or
 * interpolating observations. The null marker is presentation-only and lies
 * between two retained source samples. */
export function metricSeriesPlotPoints(
  points: readonly MetricPlotPoint[],
  mode: MetricPlot,
): MetricPlotPoint[] {
  const ordered = sortedMetricPoints(points);
  if (mode !== "line" || ordered.length < 2) return ordered;
  const valid = ordered.filter((point) => point.value !== null);
  const deltas = valid
    .slice(1)
    .map((point, index) => point.t_rel_s - valid[index]!.t_rel_s)
    .filter((delta) => delta > 0)
    .sort((a, b) => a - b);
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)]! : 0;
  const gapLimit = median > 0 ? Math.max(10, median * 5) : Number.POSITIVE_INFINITY;
  const plotted: MetricPlotPoint[] = [];
  let previousValid: MetricPlotPoint | undefined;
  let brokenSincePrevious = false;
  for (const point of ordered) {
    if (point.value === null) {
      plotted.push(point);
      brokenSincePrevious = true;
      continue;
    }
    if (
      previousValid &&
      !brokenSincePrevious &&
      (point.t_rel_s === previousValid.t_rel_s || point.t_rel_s - previousValid.t_rel_s > gapLimit)
    ) {
      plotted.push({
        seq: previousValid.seq,
        t_rel_s:
          point.t_rel_s === previousValid.t_rel_s
            ? point.t_rel_s
            : previousValid.t_rel_s + (point.t_rel_s - previousValid.t_rel_s) / 2,
        value: null,
      });
    }
    plotted.push(point);
    previousValid = point;
    brokenSincePrevious = false;
  }
  return plotted;
}

function displayForPlot(plot: MetricPlot): GraphSeriesDisplay {
  return plot === "bar" ? "bar" : plot === "point" ? "point" : "line";
}

function plotForDisplay(display: GraphSeriesDisplay): MetricPlot {
  return display === "bar" ? "bar" : display === "point" ? "point" : "line";
}

function MetricPointShape({
  cx = 0,
  cy = 0,
  radius,
  color,
}: {
  cx?: number;
  cy?: number;
  radius: number;
  color: string;
}) {
  return <circle cx={cx} cy={cy} r={radius} fill={color} />;
}

export function metricTimelineRows(
  series: ReadonlyArray<{ code: string; points: readonly MetricNumericPoint[] }>,
) {
  const rows = new Map<number, { seq: number; t_rel_s: number } & Record<string, number>>();
  for (const item of series) {
    for (const point of sortedMetricPoints(item.points)) {
      const row = rows.get(point.t_rel_s) ?? { seq: point.seq, t_rel_s: point.t_rel_s };
      row[item.code] = point.value;
      rows.set(point.t_rel_s, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.t_rel_s - b.t_rel_s || a.seq - b.seq);
}

function readMetricZoom(workspaceId: string | undefined, panelId: string): MetricZoomWindow | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(metricZoomStorageKey(workspaceId, panelId)) ?? "null",
    ) as Partial<MetricZoomWindow> | null;
    return typeof value?.startIndex === "number" && typeof value.endIndex === "number"
      ? { startIndex: value.startIndex, endIndex: value.endIndex }
      : null;
  } catch {
    return null;
  }
}

/** Aggregate routes accept a catalogue metric code, not the UI's
 * code@cell selector used by series/map endpoints. */
export const metricAggregateCode = (selection: string) =>
  parseMetricSelection(selection)?.code ?? selection;

/** 0.65.0 (F3) — Carte de rendu d'une métrique Nemo brute.
 *
 *  Quatre visualisations alignées sur le menu KPI :
 *   - **histogram** : P10/P50/P90 par opérateur depuis
 *     `/projects/{p}/metrics/{code}/aggregate?group_by=operator`.
 *   - **graph** : courbe (t_rel_s, value) depuis `/metrics/series` sur
 *     la 1re capture auto-sélectionnée (`/metrics/captures`).
 *   - **table** : table HTML des groupes de l'agrégat (opérateur, n,
 *     P10/P50/P90). Même source que histogram, affichage brut.
 *   - **map** : indisponible — `/metrics/series` ne renvoie pas de GPS.
 *
 *  Règle 1/2 : aucune valeur fabriquée, aucune interpolation front. */
export type MetricView = "histogram" | "graph" | "table" | "map";
export const METRIC_VIEW_LABELS: Record<MetricView, string> = {
  get histogram() {
    return i18n.t("metrics.86eb05ab111d");
  },
  get graph() {
    return i18n.t("metrics.ef006991fd7c");
  },
  get table() {
    return i18n.t("metrics.e86755d376aa");
  },
  get map() {
    return i18n.t("metrics.8ae525330384");
  },
};
export const METRIC_VIEW_ICONS: Record<MetricView, typeof BarChart3> = {
  histogram: BarChart3,
  graph: ChartNoAxesCombined,
  table: Table2,
  map: MapPin,
};

function ManageGraphSeriesPopover({
  settings,
  onChange,
  open,
  onOpenChange,
  onClose,
}: {
  settings: GraphSeriesSettings;
  onChange: (settings: GraphSeriesSettings) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings);
  const draftRef = useRef(settings);
  useEffect(() => {
    if (open) {
      draftRef.current = settings;
      setDraft(settings);
    }
  }, [open, settings]);
  const commit = (update: (current: GraphSeriesSettings) => GraphSeriesSettings) => {
    const next = update(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    onChange(next);
  };
  const updateSeries = (code: string, patch: Partial<ManagedGraphSeries>) =>
    commit((current) => ({
      ...current,
      series: current.series.map((item) => (item.code === code ? { ...item, ...patch } : item)),
    }));
  const updateAxis = (side: GraphAxisSide, patch: Partial<GraphAxisSettings>) =>
    commit((current) => ({
      ...current,
      axes: { ...current.axes, [side]: { ...current.axes[side], ...patch } },
    }));
  const assignAxis = (code: string, axis: GraphAxisSide) => {
    commit((current) => {
      if (!canAssignSeriesAxis(current, code, axis)) {
        toast.error(t("graphSeries.incompatibleAxis"));
        return current;
      }
      const target = current.series.find((item) => item.code === code);
      return {
        ...current,
        series: current.series.map((item) => (item.code === code ? { ...item, axis } : item)),
        axes: {
          ...current.axes,
          [axis]:
            current.axes[axis].unit || !target
              ? current.axes[axis]
              : { ...current.axes[axis], unit: target.unit },
        },
      };
    });
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // The parent menu's focus handoff emits a spurious delayed close.
        // Real dismissal paths are handled explicitly on the content below.
        if (next) onOpenChange(true);
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        collisionPadding={12}
        className="flex max-h-[min(72vh,560px)] w-[min(352px,calc(100vw-24px))] flex-col overflow-hidden p-2"
        data-testid="metric-manage-series"
        onEscapeKeyDown={onClose}
        onPointerDownOutside={onClose}
      >
        <div className="flex h-8 shrink-0 items-center justify-between px-1">
          <DropdownMenuLabel className="p-0">{t("graphSeries.manage")}</DropdownMenuLabel>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
        <label className="mb-1.5 flex h-8 shrink-0 items-center justify-between gap-2 rounded-md bg-muted/45 px-2 text-[11px] font-medium">
          {t("graphSeries.display")}
          <select
            data-testid="manage-series-global-display"
            value={
              draft.series.length > 0 &&
              draft.series.every((item) => item.display === draft.series[0]?.display)
                ? draft.series[0]?.display
                : ""
            }
            className="h-6 max-w-[132px] rounded border bg-background px-1 text-[10px]"
            onChange={(event) => {
              if (!event.target.value) return;
              const display = event.target.value as GraphSeriesDisplay;
              commit((current) => ({
                ...current,
                series: current.series.map((item) => ({ ...item, display })),
              }));
            }}
          >
            <option value="" disabled>
              {t("graphSeries.mixed")}
            </option>
            <option value="point">{t("graphSeries.points")}</option>
            <option value="line">{t("graphSeries.line")}</option>
            <option value="bar">{t("graphSeries.bars")}</option>
            <option value="point-line">{t("graphSeries.pointsLine")}</option>
          </select>
        </label>
        {draft.series.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t("graphSeries.empty")}</p>
        ) : (
          <div className="min-h-0 space-y-0.5 overflow-y-auto pr-0.5">
            {draft.series.map((series) => (
              <div
                key={series.code}
                className="grid h-9 grid-cols-[24px_18px_minmax(0,1fr)_58px_24px_24px] items-center gap-1 rounded-md px-1 hover:bg-muted/55"
                data-testid={`manage-series-row-${series.code}`}
              >
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-background"
                  aria-label={
                    series.visible
                      ? t("graphSeries.hide", { metric: series.label })
                      : t("graphSeries.show", { metric: series.label })
                  }
                  onClick={() => updateSeries(series.code, { visible: !series.visible })}
                >
                  {series.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <span
                  className="h-3.5 w-3.5 rounded-full border border-border"
                  style={{ backgroundColor: series.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate text-[11px] font-medium" title={series.label}>
                  {series.label}
                </span>
                <select
                  value={series.axis}
                  aria-label={t("graphSeries.axisFor", { metric: series.label })}
                  className="h-6 rounded border bg-background px-1 text-[10px]"
                  onChange={(event) => assignAxis(series.code, event.target.value as GraphAxisSide)}
                >
                  <option value="left">{t("graphSeries.leftY")}</option>
                  <option value="right">{t("graphSeries.rightY")}</option>
                </select>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label={t("graphSeries.color", { metric: series.label })}
                      data-testid={`manage-series-palette-${series.code}`}
                    >
                      <Palette size={13} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="right"
                    align="center"
                    collisionPadding={12}
                    className="w-[min(216px,calc(100vw-24px))] p-2"
                    data-testid={`manage-series-options-${series.code}`}
                  >
                    <div className="grid grid-cols-6 gap-1.5">
                      {METRIC_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`${series.label} ${color}`}
                          className="h-5 w-5 rounded-full border border-border"
                          style={{
                            backgroundColor: color,
                            outline: series.color === color ? "2px solid currentColor" : "none",
                            outlineOffset: 1,
                          }}
                          onClick={() => updateSeries(series.code, { color })}
                        />
                      ))}
                    </div>
                    <label className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                      {t("graphSeries.color", { metric: series.label })}
                      <input
                        type="color"
                        value={series.color}
                        className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                        onChange={(event) =>
                          updateSeries(series.code, { color: event.target.value })
                        }
                      />
                    </label>
                    <label className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                      {t("graphSeries.display")}
                      <select
                        value={series.display}
                        aria-label={t("graphSeries.displayFor", { metric: series.label })}
                        className="h-6 max-w-[116px] rounded border bg-background px-1 text-[10px]"
                        onChange={(event) =>
                          updateSeries(series.code, {
                            display: event.target.value as GraphSeriesDisplay,
                          })
                        }
                      >
                        <option value="point">{t("graphSeries.points")}</option>
                        <option value="line">{t("graphSeries.line")}</option>
                        <option value="bar">{t("graphSeries.bars")}</option>
                        <option value="point-line">{t("graphSeries.pointsLine")}</option>
                      </select>
                    </label>
                    {(series.display === "line" || series.display === "point-line") && (
                      <label className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                        {t("graphSeries.lineWidth")}
                        <input
                          type="number"
                          min="1"
                          max="8"
                          step="0.5"
                          value={series.lineWidth}
                          className="h-6 w-16 rounded border bg-background px-1"
                          onChange={(event) =>
                            updateSeries(series.code, {
                              lineWidth: Math.max(1, Math.min(8, Number(event.target.value))),
                            })
                          }
                        />
                      </label>
                    )}
                    {(series.display === "point" || series.display === "point-line") && (
                      <label className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                        {t("graphSeries.markerSize")}
                        <input
                          type="number"
                          min="2"
                          max="20"
                          value={series.markerSize}
                          className="h-6 w-16 rounded border bg-background px-1"
                          onChange={(event) =>
                            updateSeries(series.code, {
                              markerSize: Math.max(2, Math.min(20, Number(event.target.value))),
                            })
                          }
                        />
                      </label>
                    )}
                  </PopoverContent>
                </Popover>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t("graphSeries.remove", { metric: series.label })}
                  onClick={() =>
                    commit((current) => ({
                      ...current,
                      series: current.series.filter((item) => item.code !== series.code),
                    }))
                  }
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <div className="flex shrink-0 items-center gap-1.5 px-1 pb-1">
          <button
            type="button"
            className="kpi-button"
            onClick={() => {
              onClose();
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>('[data-testid="metrics-search"]')?.focus(),
              );
            }}
          >
            {t("graphSeries.addMetric")}
          </button>
          <button
            type="button"
            className="kpi-button text-destructive"
            data-testid="manage-series-remove-all"
            onClick={() => commit((current) => ({ ...current, series: [] }))}
          >
            {t("graphSeries.removeAll")}
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="kpi-button ml-auto"
                data-testid="advanced-axis-trigger"
              >
                {t("graphSeries.advancedAxis")}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="end"
              collisionPadding={12}
              className="w-[min(320px,calc(100vw-24px))] p-2"
              data-testid="metric-axis-settings"
            >
              <div className="grid grid-cols-2 gap-2">
                {(["left", "right"] as const).map((side) => {
                  const axis = draft.axes[side];
                  return (
                    <fieldset key={side} className="space-y-1 rounded-md border p-2 text-[11px]">
                      <legend className="px-1 font-semibold">
                        {side === "left" ? t("graphSeries.leftY") : t("graphSeries.rightY")}
                      </legend>
                      <label className="flex items-center justify-between gap-2">
                        {t("graphSeries.showAxis")}
                        <input
                          type="checkbox"
                          checked={axis.visible}
                          onChange={(event) => updateAxis(side, { visible: event.target.checked })}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        {t("graphSeries.autoScale")}
                        <input
                          type="checkbox"
                          checked={axis.auto}
                          onChange={(event) => updateAxis(side, { auto: event.target.checked })}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        <label>
                          {t("graphSeries.min")}
                          <input
                            type="number"
                            disabled={axis.auto}
                            value={axis.min ?? ""}
                            className="mt-0.5 h-7 w-full rounded border px-1"
                            onChange={(event) =>
                              updateAxis(side, {
                                min: event.target.value === "" ? null : Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          {t("graphSeries.max")}
                          <input
                            type="number"
                            disabled={axis.auto}
                            value={axis.max ?? ""}
                            className="mt-0.5 h-7 w-full rounded border px-1"
                            onChange={(event) =>
                              updateAxis(side, {
                                max: event.target.value === "" ? null : Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        {t("graphSeries.unit")}
                        <input
                          value={axis.unit}
                          className="mt-0.5 h-7 w-full rounded border px-1"
                          onChange={(event) => updateAxis(side, { unit: event.target.value })}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        {t("graphSeries.axisColor")}
                        <input
                          type="color"
                          value={axis.color}
                          onChange={(event) => updateAxis(side, { color: event.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground underline"
                        onClick={() =>
                          updateAxis(
                            side,
                            defaultAxisSettings(
                              draft.series.find((item) => item.axis === side)?.unit ?? "",
                            ),
                          )
                        }
                      >
                        {t("graphSeries.resetAxis")}
                      </button>
                    </fieldset>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DistributionSettingsPopover({
  settings,
  onChange,
  open,
  onOpenChange,
}: {
  settings: DistributionSettings;
  onChange: (settings: DistributionSettings) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const patch = <K extends keyof DistributionSettings>(key: K, value: DistributionSettings[K]) =>
    onChange({ ...settings, [key]: value });
  const togglePercentile = (value: number) => {
    const present = settings.percentiles.values.includes(value);
    const values = present
      ? settings.percentiles.values.filter((item) => item !== value)
      : [...settings.percentiles.values, value].sort((a, b) => a - b);
    patch("percentiles", { ...settings.percentiles, values });
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="max-h-[min(78vh,680px)] w-[min(370px,calc(100vw-24px))] overflow-y-auto p-3 text-[11px]"
        data-testid="histogram-settings"
        onEscapeKeyDown={() => onOpenChange(false)}
        onPointerDownOutside={() => onOpenChange(false)}
      >
        <div className="mb-2 flex items-center justify-between">
          <strong>{t("graphSeries.histogramSettings")}</strong>
          <button
            type="button"
            className="rounded p-1 hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            <X size={14} />
          </button>
        </div>
        <fieldset className="space-y-1.5 rounded-md border p-2">
          <legend className="px-1 font-semibold">{t("graphSeries.xRange")}</legend>
          <label className="flex items-center justify-between">
            {t("graphSeries.autoRange")}
            <input
              data-testid="histogram-range-auto"
              type="checkbox"
              checked={settings.range.auto}
              onChange={(event) =>
                patch("range", { ...settings.range, auto: event.target.checked })
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["min", "max"] as const).map((bound) => (
              <label key={bound}>
                {t(`graphSeries.${bound}`)}
                <input
                  data-testid={`histogram-range-${bound}`}
                  type="number"
                  step="any"
                  disabled={settings.range.auto}
                  value={settings.range[bound] ?? ""}
                  className="mt-0.5 h-7 w-full rounded border bg-background px-1"
                  onChange={(event) =>
                    patch("range", {
                      ...settings.range,
                      [bound]: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="underline"
            onClick={() => patch("range", { auto: true, min: null, max: null })}
          >
            {t("graphSeries.resetRange")}
          </button>
        </fieldset>
        <fieldset className="mt-2 space-y-1.5 rounded-md border p-2">
          <legend className="px-1 font-semibold">{t("graphSeries.binConfiguration")}</legend>
          <select
            data-testid="histogram-bin-mode"
            value={settings.bins.mode}
            className="h-7 w-full rounded border bg-background px-1"
            onChange={(event) =>
              patch("bins", {
                ...settings.bins,
                mode: event.target.value as DistributionSettings["bins"]["mode"],
              })
            }
          >
            <option value="auto">{t("graphSeries.autoBins")}</option>
            <option value="width">{t("graphSeries.fixedBinWidth")}</option>
            <option value="count">{t("graphSeries.fixedBinCount")}</option>
          </select>
          {settings.bins.mode === "width" && (
            <label className="flex items-center justify-between gap-2">
              {t("graphSeries.binWidth")}
              <input
                data-testid="histogram-bin-width"
                type="number"
                min="0.000001"
                step="any"
                value={settings.bins.width}
                className="h-7 w-24 rounded border bg-background px-1"
                onChange={(event) =>
                  patch("bins", {
                    ...settings.bins,
                    width: Math.max(0.000001, Number(event.target.value)),
                  })
                }
              />
            </label>
          )}
          {settings.bins.mode === "count" && (
            <label className="flex items-center justify-between gap-2">
              {t("graphSeries.binCount")}
              <input
                data-testid="histogram-bin-count"
                type="number"
                min="1"
                max="200"
                value={settings.bins.count}
                className="h-7 w-24 rounded border bg-background px-1"
                onChange={(event) =>
                  patch("bins", {
                    ...settings.bins,
                    count: Math.max(1, Math.min(200, Number(event.target.value))),
                  })
                }
              />
            </label>
          )}
        </fieldset>
        <fieldset className="mt-2 space-y-1.5 rounded-md border p-2">
          <legend className="px-1 font-semibold">{t("graphSeries.histogram")}</legend>
          <label className="flex items-center justify-between gap-2">
            {t("graphSeries.yMode")}
            <select
              data-testid="histogram-y-mode"
              value={settings.histogram.yMode}
              className="h-7 rounded border bg-background px-1"
              onChange={(event) =>
                patch("histogram", {
                  ...settings.histogram,
                  yMode: event.target.value as DistributionSettings["histogram"]["yMode"],
                })
              }
            >
              <option value="count">{t("graphSeries.count")}</option>
              <option value="percentage">{t("graphSeries.percentage")}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            {t("graphSeries.barColor")}
            <input
              data-testid="histogram-color"
              type="color"
              value={settings.histogram.color}
              onChange={(event) =>
                patch("histogram", { ...settings.histogram, color: event.target.value })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            {t("graphSeries.opacity")}
            <input
              data-testid="histogram-opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={settings.histogram.opacity}
              onChange={(event) =>
                patch("histogram", { ...settings.histogram, opacity: Number(event.target.value) })
              }
            />
          </label>
        </fieldset>
        <fieldset className="mt-2 space-y-1.5 rounded-md border p-2">
          <legend className="px-1 font-semibold">{t("graphSeries.cdfSettings")}</legend>
          <label className="flex items-center justify-between gap-2">
            {t("graphSeries.direction")}
            <select
              data-testid="cdf-direction"
              value={settings.cdf.direction}
              className="h-7 rounded border bg-background px-1"
              onChange={(event) =>
                patch("cdf", {
                  ...settings.cdf,
                  direction: event.target.value as DistributionSettings["cdf"]["direction"],
                })
              }
            >
              <option value="cdf">CDF ≤ X</option>
              <option value="ccdf">CCDF ≥ X</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            {t("graphSeries.lineColor")}
            <input
              data-testid="cdf-color"
              type="color"
              value={settings.cdf.color}
              onChange={(event) => patch("cdf", { ...settings.cdf, color: event.target.value })}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            {t("graphSeries.lineWidth")}
            <input
              type="number"
              min="1"
              max="6"
              step="0.5"
              value={settings.cdf.width}
              className="h-7 w-20 rounded border px-1"
              onChange={(event) =>
                patch("cdf", { ...settings.cdf, width: Number(event.target.value) })
              }
            />
          </label>
        </fieldset>
        <fieldset className="mt-2 space-y-1.5 rounded-md border p-2">
          <legend className="px-1 font-semibold">{t("graphSeries.percentileSettings")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {[5, 10, 25, 50, 75, 90, 95].map((value) => (
              <label
                key={value}
                className="inline-flex items-center gap-1 rounded border px-1.5 py-1"
              >
                <input
                  type="checkbox"
                  checked={settings.percentiles.values.includes(value)}
                  onChange={() => togglePercentile(value)}
                />{" "}
                P{value}
              </label>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2">
            {t("graphSeries.customPercentile")}
            <input
              data-testid="custom-percentile"
              type="number"
              min="0"
              max="100"
              className="h-7 w-20 rounded border px-1"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const value = Number(event.currentTarget.value);
                if (
                  Number.isFinite(value) &&
                  value >= 0 &&
                  value <= 100 &&
                  !settings.percentiles.values.includes(value)
                )
                  patch("percentiles", {
                    ...settings.percentiles,
                    values: [...settings.percentiles.values, value].sort((a, b) => a - b),
                  });
              }}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            {t("graphSeries.lineColor")}
            <input
              data-testid="percentile-color"
              type="color"
              value={settings.percentiles.color}
              onChange={(event) =>
                patch("percentiles", { ...settings.percentiles, color: event.target.value })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            {t("graphSeries.lineWidth")}
            <input
              data-testid="percentile-line-width"
              type="number"
              min="1"
              max="6"
              step="0.5"
              value={settings.percentiles.width}
              className="h-7 w-20 rounded border px-1"
              onChange={(event) =>
                patch("percentiles", {
                  ...settings.percentiles,
                  width: Math.max(1, Math.min(6, Number(event.target.value))),
                })
              }
            />
          </label>
          {(["showLines", "showMarkers", "showLabels"] as const).map((key) => (
            <label key={key} className="flex items-center justify-between gap-2">
              {t(`graphSeries.${key}`)}
              <input
                data-testid={`percentile-${key}`}
                type="checkbox"
                checked={settings.percentiles[key]}
                onChange={(event) =>
                  patch("percentiles", {
                    ...settings.percentiles,
                    [key]: event.target.checked,
                  })
                }
              />
            </label>
          ))}
        </fieldset>
        <p className="mt-2 text-[10px] text-muted-foreground">{t("graphSeries.populationHint")}</p>
      </PopoverContent>
    </Popover>
  );
}

export function MetricGraphCard({
  projectId,
  code,
  label,
  unit,
  tech,
  category,
  eventCode,
  appliedFilters,
  onRemove,
  view: viewProp,
  onViewChange,
  onOpenTable,
  // 1.97.0 (Phase 2 Charts) — syncId Recharts : toutes les cartes partageant
  // le même syncId voient leur Tooltip/cursor déclenchés simultanément au
  // survol de n'importe laquelle. Non-breaking : undefined = pas de sync.
  syncId,
  eventsCaptureId,
  // 1.99.1 (lot C axe X temps) — mode d'affichage de l'axe temps + meta pour
  // le compute (nmf_start_at + origin_ts + utc_offset_min). Undefined =
  // "capture" (comportement 1.97.0).
  timeAxisMode,
  workspaceId,
  panelId,
  panelNumber,
  displayNames,
  style: styleProp,
  onStyleChange,
  prefetchedSeries,
  batchSeries = false,
  prefetchedSeriesPending = false,
  prefetchedSeriesError,
  onPrefetchedSeriesRetry,
}: {
  projectId: string;
  code: string;
  label: string;
  unit: string;
  tech: string;
  category: string | null | undefined;
  eventCode: string;
  appliedFilters: KpiQueryFilters;
  onRemove: () => void;
  view?: MetricView | undefined;
  onViewChange?: ((view: MetricView) => void) | undefined;
  onOpenTable?: (() => void) | undefined;
  syncId?: string | undefined;
  eventsCaptureId?: string | undefined;
  timeAxisMode?: TimeAxisMode | undefined;
  workspaceId?: string | undefined;
  panelId?: string | undefined;
  panelNumber?: number | undefined;
  displayNames?: ReadonlyMap<string, string> | undefined;
  style?: MetricStyle | undefined;
  onStyleChange?: ((style: MetricStyle) => void) | undefined;
  prefetchedSeries?: ChronogramData | undefined;
  batchSeries?: boolean | undefined;
  prefetchedSeriesPending?: boolean | undefined;
  prefetchedSeriesError?: unknown;
  onPrefetchedSeriesRetry?: (() => void) | undefined;
}) {
  const { t: translate } = useTranslation();
  const [localView, setLocalView] = useState<MetricView>("histogram");
  const view = viewProp ?? localView;
  const setView = (v: MetricView) => {
    setLocalView(v);
    onViewChange?.(v);
  };
  const cardRef = useRef<HTMLElement>(null);
  const zoomPanelId = panelId ?? code;
  const zoomKey = metricZoomStorageKey(workspaceId, zoomPanelId);
  const [zoomState, setZoomState] = useState<{ key: string; value: MetricZoomWindow | null }>(
    () => ({
      key: zoomKey,
      value: readMetricZoom(workspaceId, zoomPanelId),
    }),
  );
  if (zoomState.key !== zoomKey) {
    setZoomState({ key: zoomKey, value: readMetricZoom(workspaceId, zoomPanelId) });
  }
  const zoom = zoomState.key === zoomKey ? zoomState.value : null;
  const saveZoom = (next: MetricZoomWindow | null) => {
    setZoomState({ key: zoomKey, value: next });
    try {
      if (next) localStorage.setItem(zoomKey, JSON.stringify(next));
      else localStorage.removeItem(zoomKey);
    } catch {
      /* The mounted graph remains authoritative when storage is unavailable. */
    }
  };
  // Style du graphe (tracé + couleur) : mémorisé par onglet par le parent.
  const style = styleProp ?? DEFAULT_METRIC_STYLE;
  const setStyle = (next: MetricStyle) => onStyleChange?.(next);
  const seriesSettingsId = panelId ?? code;
  const seriesSettingsKey = `${workspaceId ?? "metrics"}:${seriesSettingsId}`;
  const displayName = (selection: string, fallback: string) =>
    displayNames?.get(selection) ??
    displayNames?.get(selection.split("!", 1)[0] ?? selection) ??
    fallback;
  const buildDefaultSeriesSettings = () =>
    initialGraphSeriesSettings(
      { code, label: displayName(code, label), unit, color: style.color },
      readGraphSeries(workspaceId, code).map((item) => ({
        ...item,
        label: displayName(item.code, item.label),
      })),
      readHiddenGraphSeries(workspaceId, code),
    );
  const buildInitialSeriesSettings = () => {
    const stored =
      readGraphSeriesSettings(workspaceId, seriesSettingsId, displayName) ??
      buildDefaultSeriesSettings();
    // `metric-styles` was historically the state displayed by the Style menu,
    // while the renderer read `series.display`. Reconcile that legacy split at
    // the boundary; subsequent writes keep both stores aligned.
    return {
      ...stored,
      series: stored.series.map((item) =>
        item.code === code
          ? { ...item, color: style.color, display: displayForPlot(style.plot) }
          : item,
      ),
    };
  };
  const [managedState, setManagedState] = useState<{
    key: string;
    value: GraphSeriesSettings;
  }>(() => ({ key: seriesSettingsKey, value: buildInitialSeriesSettings() }));
  if (managedState.key !== seriesSettingsKey) {
    setManagedState({ key: seriesSettingsKey, value: buildInitialSeriesSettings() });
  }
  const seriesSettings =
    managedState.key === seriesSettingsKey ? managedState.value : buildInitialSeriesSettings();
  const resolvedSeriesSettings = {
    ...seriesSettings,
    series: seriesSettings.series.map((item) => ({
      ...item,
      label: displayName(item.code, item.label),
    })),
  };
  const saveSeriesSettings = (next: GraphSeriesSettings) => {
    setManagedState({ key: seriesSettingsKey, value: next });
    writeGraphSeriesSettings(workspaceId, seriesSettingsId, next);
    const base = next.series.find((item) => item.code === code);
    if (base) {
      const nextStyle = { color: base.color, plot: plotForDisplay(base.display) };
      if (nextStyle.color !== style.color || nextStyle.plot !== style.plot) setStyle(nextStyle);
    }
  };
  // 1.146.2 — "Histogram" used to be a separate operator-aggregate view.
  // The catalogue action and persisted legacy panels now migrate to the
  // distribution mode of the regular series graph.  This keeps the exact
  // cell selector (for example `pdsch_bitrate@lte-type-0`) and therefore
  // reads the same `/metrics/series` points as Timeline/CDF/Percentile.
  // Rendering below already uses the migrated settings during this first
  // paint, so the obsolete aggregate request is never started.
  const renderedSeriesSettings =
    view === "histogram"
      ? {
          ...resolvedSeriesSettings,
          analysisMode: "histogram" as const,
          distribution: {
            ...resolvedSeriesSettings.distribution,
            modes: { ...resolvedSeriesSettings.distribution.modes, histogram: true },
          },
        }
      : resolvedSeriesSettings;
  useEffect(() => {
    if (view !== "histogram") return;
    saveSeriesSettings(renderedSeriesSettings);
    setView("graph");
    // This is a one-shot migration keyed by the legacy panel view. The state
    // writers intentionally must not make this effect repeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const [over, setOver] = useState(false);
  const [seriesManagerOpen, setSeriesManagerOpen] = useState(false);
  const [distributionSettingsOpen, setDistributionSettingsOpen] = useState(false);
  const openSeriesManager = () => {
    setSeriesManagerOpen(true);
  };
  const dropMetric = (raw: string) => {
    const metric = readMapMetric(raw);
    if (!metric) return;
    if (metric.kind !== "metric") {
      toast.error(translate("graphSeries.kpiUnsupported"));
      return;
    }
    if (resolvedSeriesSettings.series.some((item) => item.code === metric.code)) {
      toast.error(translate("graphSeries.duplicate"));
      return;
    }
    const result = addManagedSeries(resolvedSeriesSettings, {
      code: metric.code,
      label: displayName(metric.code, metric.label),
      unit: metric.unit,
    });
    if (!result) {
      toast.error(translate("graphSeries.axis"));
      return;
    }
    saveSeriesSettings(result);
    toast.success(translate("graphSeries.added", { metric: metric.label }));
  };
  return (
    <article
      ref={cardRef}
      id={`metric-graph-${code}`}
      className={`kpi-graph-card ${over ? "is-drop-target" : ""}`}
      data-metric-code={code}
      data-view={view}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(MAP_METRIC_MIME)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(MAP_METRIC_MIME)) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        dropMetric(event.dataTransfer.getData(MAP_METRIC_MIME));
      }}
    >
      <header className="kpi-card-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3
              title={
                resolvedSeriesSettings.series[0]?.label ?? translate("graphSeries.noMetricsTitle")
              }
            >
              {resolvedSeriesSettings.series[0]
                ? `${panelNumber ? `${panelNumber}. ` : ""}${resolvedSeriesSettings.series[0].label}`
                : translate("graphSeries.noMetricsTitle")}
            </h3>
          </div>
          <p>
            {tech} · [{eventCode}] · {unit} · {category ?? "autres"}
          </p>
        </div>
        <div className="flex gap-0.5 shrink-0 items-center">
          <WorkspacePanelMenu label={`Actions ${label}`}>
            <DropdownMenuLabel>{translate("panel.visualization")}</DropdownMenuLabel>
            {(Object.keys(METRIC_VIEW_LABELS) as MetricView[])
              .filter((mode) => mode !== "map")
              .map((mode) => {
                const Icon = METRIC_VIEW_ICONS[mode];
                return (
                  <DropdownMenuItem
                    key={mode}
                    data-testid={`metric-view-${mode}`}
                    onSelect={() => setView(mode)}
                  >
                    <Icon size={14} />
                    {METRIC_VIEW_LABELS[mode]}
                    {mode === view ? " ✓" : ""}
                  </DropdownMenuItem>
                );
              })}
            {onOpenTable && (
              <DropdownMenuItem data-testid="metric-open-table" onSelect={onOpenTable}>
                <Table2 size={14} /> {translate("panel.open_metrics_table")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="metric-style-sub">
                <Palette size={14} /> {translate("panel.style")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-[190px]" data-testid="metric-style-menu">
                <DropdownMenuLabel>{translate("panel.plot")}</DropdownMenuLabel>
                {METRIC_PLOTS.map((mode) => {
                  const Icon = METRIC_PLOT_ICONS[mode];
                  const renderedPlot = plotForDisplay(
                    resolvedSeriesSettings.series.find((item) => item.code === code)?.display ??
                      displayForPlot(style.plot),
                  );
                  return (
                    <DropdownMenuItem
                      key={mode}
                      data-testid={`metric-plot-${mode}`}
                      onSelect={(event) => {
                        // Le menu reste ouvert : la couleur se choisit juste en
                        // dessous, sans devoir tout rouvrir.
                        event.preventDefault();
                        saveSeriesSettings({
                          ...resolvedSeriesSettings,
                          series: resolvedSeriesSettings.series.map((item) =>
                            item.code === code ? { ...item, display: displayForPlot(mode) } : item,
                          ),
                        });
                      }}
                    >
                      <Icon size={14} />
                      {translate(`panel.plot_${mode}`)}
                      {mode === renderedPlot ? " ✓" : ""}
                    </DropdownMenuItem>
                  );
                })}
                {(() => {
                  const base = resolvedSeriesSettings.series.find((item) => item.code === code);
                  if (!base) return null;
                  const renderedPlot = plotForDisplay(base.display);
                  return (
                    <>
                      {renderedPlot === "line" && (
                        <label className="flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
                          {translate("graphSeries.lineWidth")}
                          <input
                            data-testid="metric-line-width"
                            type="number"
                            min="1"
                            max="8"
                            step="0.5"
                            value={base.lineWidth}
                            className="h-6 w-16 rounded border bg-background px-1"
                            onChange={(event) =>
                              saveSeriesSettings({
                                ...resolvedSeriesSettings,
                                series: resolvedSeriesSettings.series.map((item) =>
                                  item.code === code
                                    ? {
                                        ...item,
                                        lineWidth: Math.max(
                                          1,
                                          Math.min(8, Number(event.target.value)),
                                        ),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                      {renderedPlot === "point" && (
                        <label className="flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
                          {translate("graphSeries.markerSize")}
                          <input
                            data-testid="metric-marker-size"
                            type="number"
                            min="2"
                            max="20"
                            value={base.markerSize}
                            className="h-6 w-16 rounded border bg-background px-1"
                            onChange={(event) =>
                              saveSeriesSettings({
                                ...resolvedSeriesSettings,
                                series: resolvedSeriesSettings.series.map((item) =>
                                  item.code === code
                                    ? {
                                        ...item,
                                        markerSize: Math.max(
                                          2,
                                          Math.min(20, Number(event.target.value)),
                                        ),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                    </>
                  );
                })()}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{translate("panel.color")}</DropdownMenuLabel>
                <div className="grid grid-cols-4 gap-1.5 px-2 pb-1.5">
                  {METRIC_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      data-testid={`metric-color-${color}`}
                      aria-label={color}
                      title={color}
                      onClick={() => {
                        saveSeriesSettings({
                          ...resolvedSeriesSettings,
                          series: resolvedSeriesSettings.series.map((item) =>
                            item.code === code ? { ...item, color } : item,
                          ),
                        });
                      }}
                      className="h-5 w-5 rounded-sm border border-border"
                      style={{
                        background: color,
                        outline: color === style.color ? "2px solid currentColor" : "none",
                        outlineOffset: 1,
                      }}
                    />
                  ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {view === "graph" && (
              <DropdownMenuItem
                data-testid="metric-manage-series-trigger"
                onSelect={() => window.setTimeout(openSeriesManager, 100)}
              >
                <SlidersHorizontal size={14} /> {translate("graphSeries.manage")}
              </DropdownMenuItem>
            )}
            {view === "graph" && (
              <DropdownMenuItem
                data-testid="histogram-settings-trigger"
                onSelect={() => window.setTimeout(() => setDistributionSettingsOpen(true), 100)}
              >
                <BarChart3 size={14} /> {translate("graphSeries.histogramSettings")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {view === "graph" && (
              <DropdownMenuItem
                data-testid="metric-reset-zoom"
                disabled={!zoom}
                onSelect={() => saveZoom(null)}
              >
                <RotateCcw size={14} /> {translate("panel.resetZoom")}
              </DropdownMenuItem>
            )}
            {view === "graph" && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => void cardRef.current?.requestFullscreen?.()}>
              <Maximize2 size={14} /> {translate("panel.fullscreen")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <SharePanelMenuItem projectId={projectId} testId="metric-share-graph" />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRemove}>
              <X size={14} /> {translate("panel.remove")}
            </DropdownMenuItem>
          </WorkspacePanelMenu>
          {view === "graph" && (
            <>
              <ManageGraphSeriesPopover
                settings={resolvedSeriesSettings}
                onChange={saveSeriesSettings}
                open={seriesManagerOpen}
                onOpenChange={setSeriesManagerOpen}
                onClose={() => setSeriesManagerOpen(false)}
              />
              <DistributionSettingsPopover
                settings={renderedSeriesSettings.distribution}
                onChange={(distribution) =>
                  saveSeriesSettings({
                    ...renderedSeriesSettings,
                    distribution,
                  })
                }
                open={distributionSettingsOpen}
                onOpenChange={setDistributionSettingsOpen}
              />
            </>
          )}
        </div>
      </header>
      {view === "histogram" || view === "graph" ? (
        <MetricTimePlot
          projectId={projectId}
          code={code}
          label={label}
          unit={unit}
          settings={renderedSeriesSettings}
          onSettingsChange={saveSeriesSettings}
          onOpenDistributionSettings={() => setDistributionSettingsOpen(true)}
          syncId={syncId}
          timeAxisMode={timeAxisMode}
          eventsCaptureId={eventsCaptureId}
          workspaceId={workspaceId}
          zoom={zoom}
          onZoomChange={saveZoom}
          prefetchedSeries={prefetchedSeries}
          batchSeries={batchSeries}
          prefetchedSeriesPending={prefetchedSeriesPending}
          prefetchedSeriesError={prefetchedSeriesError}
          onPrefetchedSeriesRetry={onPrefetchedSeriesRetry}
        />
      ) : view === "table" ? (
        <MetricAggregateTable
          projectId={projectId}
          code={code}
          unit={unit}
          appliedFilters={appliedFilters}
        />
      ) : (
        <div className="kpi-chart-state" role="status" data-testid="metric-map-state">
          <strong>{translate("metrics.cdb583a56010")}</strong>
          <p>
            {" "}
            {translate("metrics.62a5dc8d2766")} <code>/metrics/series</code>{" "}
            {translate("metrics.2870ce5d97d0")}{" "}
          </p>
        </div>
      )}
    </article>
  );
}

function MetricAggregatePlot({
  projectId,
  code,
  label,
  unit,
  appliedFilters,
}: {
  projectId: string;
  code: string;
  label: string;
  unit: string;
  appliedFilters: KpiQueryFilters;
}) {
  const { t: translate } = useTranslation();
  const aggregateCode = metricAggregateCode(code);
  const query = useQuery({
    queryKey: ["metric-aggregate", projectId, aggregateCode, "operator", appliedFilters],
    queryFn: ({ signal }) =>
      getMetricAggregate(projectId, aggregateCode, "operator", appliedFilters, signal),
    retry: false,
  });

  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);

  const option = useMemo<EChartsOption>(() => {
    const groups = query.data?.groups ?? [];
    const sorted = [...groups].sort((a, b) => (b.n || 0) - (a.n || 0));
    const labels = sorted.map((g) => g.operator ?? translate("metrics.51d3aaf58c26"));
    // 1.49.1 — grouper P10/P50/P90 côte à côte : une barre pleine
    // (opérateur) pour chaque percentile. Évite les bars à hauteur 0
    // invisibles quand p50=0 (ex. BLER où la médiane est 0 par
    // définition et seul p90 porte l'info).
    const stats: Array<{ key: "p10" | "p50" | "p90"; label: string; opacity: number }> = [
      { key: "p10", label: "P10", opacity: 0.35 },
      { key: "p50", label: "P50", opacity: 0.7 },
      { key: "p90", label: "P90", opacity: 1 },
    ];
    return {
      animationDuration: 150,
      grid: { left: 58, right: 20, top: 28, bottom: 44 },
      tooltip: { trigger: "axis", confine: true, renderMode: "richText" },
      legend: { top: 0, right: 20, itemHeight: 8, itemGap: 10, textStyle: { fontSize: 10 } },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: "#64748b", fontSize: 10 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#cbd5e1" } },
      },
      yAxis: {
        type: "value",
        name: unit,
        scale: false,
        axisLabel: { color: "#64748b", fontSize: 10 },
        splitLine: { lineStyle: { color: "#e7edf5", type: "dashed" } },
      },
      series: stats.map((s) => ({
        type: "bar" as const,
        barMaxWidth: 24,
        name: s.label,
        data: sorted.map((g) => ({
          value: g[s.key],
          itemStyle: { color: operatorColor(g.operator), opacity: s.opacity },
        })),
        label: {
          show: s.key === "p50" || s.key === "p90",
          position: "top" as const,
          fontSize: 9,
          formatter: (p: { value?: unknown }) =>
            typeof p.value === "number"
              ? formatNumber(p.value, {
                  minimumFractionDigits: unit === "%" ? 1 : 2,
                  maximumFractionDigits: unit === "%" ? 1 : 2,
                })
              : "—",
        },
      })),
    };
  }, [translate, query.data, unit]);

  // 1.49.2 — le div hôte n'existe pas tant que query est pending (early
  // return "Chargement…"). On attend que le DOM soit prêt (data arrivée)
  // avant d'instancier ECharts. La dépendance query.data garantit que
  // l'effet re-run quand le composant passe de "loading" au vrai render.
  const ready = !query.isPending && !query.isError && !!query.data?.groups.length;
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    import("echarts")
      .then((echarts) => {
        if (disposed || !host.current) return;
        chart.current = echarts.init(host.current, undefined, { renderer: "canvas" });
        chart.current.setOption(option);
        observer = new ResizeObserver(() => chart.current?.resize());
        observer.observe(host.current);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);

  if (query.isPending) {
    return <ChartSpinner label={translate("metrics.fc725ec040f4")} />;
  }
  if (query.isError) {
    return (
      <QueryErrorState
        error={query.error}
        title={translate("metrics.f82af3f196cf")}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!query.data?.groups.length) {
    return (
      <div className="kpi-chart-state" role="status">
        {" "}
        {translate("metrics.d02d5671d4a1")}{" "}
      </div>
    );
  }
  return (
    <div
      className="kpi-plot"
      style={{ minHeight: "var(--kpi-panel-chart-height, 235px)" }}
      ref={host}
      role="img"
      data-testid="metric-aggregate-plot"
      aria-label={translate("metrics.d5b4f0dc6e6e", {
        v0: label,
        v1: query.data.groups
          .map((g) => `${g.operator ?? "N/D"} ${g.p50 ?? "—"} ${unit}`)
          .join(" ; "),
      })}
    />
  );
}

/** 1.49.4 — Table HTML des groupes de l'agrégat métrique. Même source
 *  que l'histogramme (`/metrics/{code}/aggregate?group_by=operator`),
 *  rendu brut : opérateur, n, P10/P50/P90. Pas de calcul front. */
function MetricAggregateTable({
  projectId,
  code,
  unit,
  appliedFilters,
}: {
  projectId: string;
  code: string;
  unit: string;
  appliedFilters: KpiQueryFilters;
}) {
  const { t: translate, i18n: locale } = useTranslation();
  const tableProps = usePanelTableSettings();
  const aggregateCode = metricAggregateCode(code);
  const query = useQuery({
    queryKey: ["metric-aggregate", projectId, aggregateCode, "operator", appliedFilters],
    queryFn: ({ signal }) =>
      getMetricAggregate(projectId, aggregateCode, "operator", appliedFilters, signal),
    retry: false,
  });
  if (query.isPending) return <ChartSpinner label={translate("metrics.fc725ec040f4")} />;
  if (query.isError)
    return (
      <QueryErrorState
        error={query.error}
        title={translate("metrics.f82af3f196cf")}
        onRetry={() => void query.refetch()}
      />
    );
  const groups = query.data?.groups ?? [];
  if (!groups.length)
    return (
      <div className="kpi-chart-state" role="status">
        {" "}
        {translate("metrics.d02d5671d4a1")}{" "}
      </div>
    );
  const fmt = (v: number | null) =>
    v === null
      ? "—"
      : formatNumber(v, {
          minimumFractionDigits: unit === "%" ? 2 : unit === "dB" || unit === "dBm" ? 1 : 2,
          maximumFractionDigits: unit === "%" ? 2 : unit === "dB" || unit === "dBm" ? 1 : 2,
        });
  return (
    <div className="kpi-data-table kpi-ts" data-testid="metric-aggregate-table" {...tableProps}>
      <div className="kpi-table-scroll" style={{ maxHeight: 235 }}>
        <table>
          <thead>
            <tr>
              <th>{translate("metrics.16602c56b3e8")}</th>
              <th className="numeric">n</th>
              <th className="numeric">P10</th>
              <th className="numeric">P50</th>
              <th className="numeric">P90</th>
              <th>{translate("metrics.1ee30a8526db")}</th>
            </tr>
          </thead>
          <tbody>
            {[...groups]
              .sort((a, b) => (b.n || 0) - (a.n || 0))
              .map((g, i) => (
                <tr key={`${g.operator ?? "nd"}-${i}`}>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: operatorColor(g.operator),
                        marginRight: 6,
                      }}
                    />
                    {g.operator ?? translate("metrics.51d3aaf58c26")}
                  </td>
                  <td className="numeric">
                    {g.n.toLocaleString(locale.resolvedLanguage === "fr" ? "fr-FR" : "en-GB")}
                  </td>
                  <td className="numeric">{fmt(g.p10)}</td>
                  <td className="numeric">{fmt(g.p50)}</td>
                  <td className="numeric">{fmt(g.p90)}</td>
                  <td>{unit}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type DistributionRenderSeries = ManagedGraphSeries & {
  points: MetricPlotPoint[];
  values: number[];
};

type DistributionTooltipParam = {
  seriesId?: string;
  seriesName?: string;
  marker?: string;
  value?: unknown;
};

const escapeDistributionTooltip = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function MetricDistributionPlot({
  settings,
  series,
}: {
  settings: DistributionSettings;
  series: DistributionRenderSeries[];
}) {
  const { t } = useTranslation();
  const visible = series.filter((item) => item.visible);
  const commonUnit = visible[0]?.unit ?? "";
  const compatible = visible.filter(
    (item) => normalizeUnit(item.unit) === normalizeUnit(commonUnit),
  );
  const histogram = useMemo(() => histogramResult(compatible, settings), [compatible, settings]);
  const curves = useMemo(
    () =>
      compatible.map((item) => {
        const values = filterDistributionValues(item.values, settings.range);
        return {
          ...item,
          populationSize: values.length,
          distribution: cdfPoints(values, settings.cdf.direction),
          percentileCurve: percentilePoints(values),
          percentileValues: settings.percentiles.values.flatMap((percentile) => {
            const value = quantile(values, percentile);
            return value === null ? [] : [{ percentile, value, population: values.length }];
          }),
        };
      }),
    [compatible, settings.cdf.direction, settings.percentiles.values, settings.range],
  );
  const population = histogram.population;
  const yKey = settings.histogram.yMode;
  const xLabel = commonUnit || t("graphSeries.valueAxis");
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const percentageAxis = settings.modes.cdf || settings.modes.percentile;
  const option = useMemo<EChartsOption>(() => {
    if (!population) return {};
    const chartSeries: NonNullable<EChartsOption["series"]> = [];
    if (settings.modes.histogram) {
      compatible.forEach((item) => {
        chartSeries.push({
          id: `histogram:${item.code}`,
          name: item.label,
          type: "bar",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: histogram.rows.map((row) => [
            row.x,
            row[`${item.code}__${yKey}`] ?? 0,
            row[`${item.code}__count`] ?? 0,
            row[`${item.code}__percentage`] ?? 0,
            row.x0,
            row.x1,
          ]),
          barGap: "8%",
          barCategoryGap: "8%",
          itemStyle: {
            color: compatible.length === 1 ? settings.histogram.color : item.color,
            opacity: settings.histogram.opacity,
          },
          emphasis: { focus: "series" },
          z: 1,
          animation: false,
        });
      });
    }
    if (settings.modes.cdf) {
      curves.forEach((item) => {
        const populationSize = item.populationSize;
        chartSeries.push({
          id: `cdf:${item.code}`,
          name: `${item.label} · ${settings.cdf.direction.toUpperCase()}`,
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: item.distribution.map((point) => [
            point.x,
            point.y,
            Math.round((point.y / 100) * populationSize),
          ]),
          step: "end",
          showSymbol: false,
          smooth: false,
          connectNulls: false,
          lineStyle: {
            color: compatible.length === 1 ? settings.cdf.color : item.color,
            width: settings.cdf.width,
          },
          itemStyle: { color: compatible.length === 1 ? settings.cdf.color : item.color },
          z: 5,
          animation: false,
        });
      });
    }
    if (settings.modes.percentile) {
      curves.forEach((item) => {
        const curveColor = compatible.length === 1 ? settings.percentiles.color : item.color;
        chartSeries.push({
          id: `percentile:${item.code}`,
          name: `${item.label} · ${t("graphSeries.percentile")}`,
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: item.percentileCurve.map((point) => [point.x, point.y, item.populationSize]),
          showSymbol: false,
          smooth: false,
          connectNulls: false,
          lineStyle: { color: curveColor, width: settings.percentiles.width },
          itemStyle: { color: curveColor },
          ...(settings.percentiles.showLines
            ? {
                markLine: {
                  silent: false,
                  symbol: ["none", "none"],
                  lineStyle: { color: "#dc2626", type: "dashed", width: 1.2, opacity: 0.82 },
                  label: { show: false },
                  data: item.percentileValues.map((marker, index) => ({
                    name: `P${marker.percentile}`,
                    xAxis: marker.value,
                    tooltip: {
                      formatter: `${escapeDistributionTooltip(item.label)} P${marker.percentile}<br/>${formatNumber(marker.value, { maximumFractionDigits: 4 })} ${escapeDistributionTooltip(item.unit)} · n=${marker.population}`,
                    },
                    label: settings.percentiles.showLabels
                      ? {
                          show: true,
                          position: "insideEndTop",
                          distance: 4 + (index % 3) * 12,
                          color: "#b91c1c",
                          fontSize: 9,
                          formatter: `P${marker.percentile} ${formatNumber(marker.value, { maximumFractionDigits: 2 })} ${item.unit}`,
                        }
                      : { show: false },
                  })),
                },
              }
            : {}),
          z: 6,
          animation: false,
        });
        if (settings.percentiles.showMarkers) {
          chartSeries.push({
            id: `percentile-markers:${item.code}`,
            name: `${item.label} · ${t("graphSeries.percentile")} markers`,
            type: "scatter",
            xAxisIndex: 0,
            yAxisIndex: 1,
            data: item.percentileValues.map((marker) => [
              marker.value,
              marker.percentile,
              marker.population,
            ]),
            symbol: "circle",
            symbolSize: 8,
            itemStyle: { color: curveColor, borderColor: "#ffffff", borderWidth: 1.5 },
            z: 8,
            animation: false,
          });
        }
      });
    }
    return {
      animation: false,
      // The host already has a concise localized aria-label. ECharts' generated
      // label enumerates every distribution point and can add thousands of
      // values to the accessibility tree for dense RF series.
      aria: { enabled: false },
      grid: {
        top: 52,
        right: percentageAxis ? 62 : 22,
        bottom: 42,
        left: settings.modes.histogram ? 64 : 42,
        containLabel: false,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", snap: false },
        confine: true,
        formatter: (rawParams: unknown) => {
          const params = (
            Array.isArray(rawParams) ? rawParams : [rawParams]
          ) as DistributionTooltipParam[];
          const lines: string[] = [];
          for (const param of params) {
            if (!Array.isArray(param.value)) continue;
            const values = param.value.map(Number);
            const id = param.seriesId ?? "";
            const name = escapeDistributionTooltip(param.seriesName);
            if (id.startsWith("histogram:")) {
              lines.push(
                `<strong>${name}</strong><br/>${formatNumber(values[4]!, { maximumFractionDigits: 4 })} – ${formatNumber(values[5]!, { maximumFractionDigits: 4 })} ${escapeDistributionTooltip(commonUnit)}<br/>${t("graphSeries.count")}: ${formatNumber(values[2]!, { maximumFractionDigits: 0 })} · ${t("graphSeries.percentage")}: ${formatNumber(values[3]!, { maximumFractionDigits: 2 })}%`,
              );
            } else if (id.startsWith("cdf:")) {
              lines.push(
                `${param.marker ?? ""}<strong>${name}</strong><br/>X: ${formatNumber(values[0]!, { maximumFractionDigits: 4 })} ${escapeDistributionTooltip(commonUnit)} · ${settings.cdf.direction.toUpperCase()}: ${formatNumber(values[1]!, { maximumFractionDigits: 2 })}% · ${t("graphSeries.cumulativeCount")}: ${formatNumber(values[2]!, { maximumFractionDigits: 0 })}`,
              );
            } else if (id.startsWith("percentile-markers:")) {
              lines.push(
                `${param.marker ?? ""}<strong>${name}</strong><br/>P${formatNumber(values[1]!, { maximumFractionDigits: 2 })}: ${formatNumber(values[0]!, { maximumFractionDigits: 4 })} ${escapeDistributionTooltip(commonUnit)} · n=${formatNumber(values[2]!, { maximumFractionDigits: 0 })}`,
              );
            } else if (id.startsWith("percentile:")) {
              lines.push(
                `${param.marker ?? ""}<strong>${name}</strong><br/>P${formatNumber(values[1]!, { maximumFractionDigits: 2 })}: ${formatNumber(values[0]!, { maximumFractionDigits: 4 })} ${escapeDistributionTooltip(commonUnit)} · n=${formatNumber(values[2]!, { maximumFractionDigits: 0 })}`,
              );
            }
          }
          return lines.join('<div style="height:4px"></div>');
        },
      },
      xAxis: {
        type: "value",
        min: population.min,
        max: population.max,
        name: xLabel,
        nameLocation: "middle",
        nameGap: 27,
        axisLabel: {
          color: "#64748b",
          fontSize: 10,
          formatter: (value: number) =>
            formatDistributionTick(value, commonUnit, population.min, population.max),
        },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: "value",
          min: 0,
          show: settings.modes.histogram,
          name:
            settings.histogram.yMode === "percentage"
              ? t("graphSeries.percentage")
              : t("graphSeries.count"),
          nameLocation: "middle",
          nameGap: 43,
          ...(settings.histogram.yMode === "count" ? { minInterval: 1 } : {}),
          axisLabel: {
            color: "#64748b",
            fontSize: 10,
            formatter: (value: number) =>
              settings.histogram.yMode === "percentage"
                ? `${formatNumber(value, { maximumFractionDigits: 1 })}%`
                : formatNumber(value, { maximumFractionDigits: 0 }),
          },
          splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
        },
        {
          type: "value",
          min: 0,
          max: 100,
          interval: 20,
          show: percentageAxis,
          name: t("graphSeries.percentileAxis"),
          nameLocation: "middle",
          nameGap: 42,
          axisLabel: {
            color: settings.modes.cdf ? settings.cdf.color : settings.percentiles.color,
            fontSize: 10,
            formatter: (value: number) => `${Math.round(value)}%`,
          },
          splitLine: { show: false },
        },
      ],
      series: chartSeries,
    };
  }, [
    commonUnit,
    compatible,
    curves,
    histogram.rows,
    percentageAxis,
    population,
    settings,
    t,
    xLabel,
    yKey,
  ]);
  const currentOption = useRef(option);
  currentOption.current = option;

  const ready = Boolean(population);
  useEffect(() => {
    if (!ready || !host.current) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    void import("echarts").then((echarts) => {
      if (disposed || !host.current) return;
      chart.current = echarts.init(host.current, undefined, { renderer: "canvas" });
      chart.current.setOption(currentOption.current, {
        notMerge: false,
        replaceMerge: ["series"],
      });
      observer = new ResizeObserver(() => chart.current?.resize());
      observer.observe(host.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, [ready]);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: false, replaceMerge: ["series"] });
  }, [option]);

  if (!population) return <div className="kpi-empty">{t("graphSeries.noDistributionPoints")}</div>;
  return (
    <div
      className="relative h-full w-full"
      data-testid="metric-distribution-plot"
      data-histogram-series={settings.modes.histogram ? compatible.length : 0}
      data-cdf-series={settings.modes.cdf ? compatible.length : 0}
      data-percentile-series={settings.modes.percentile ? compatible.length : 0}
      data-percentile-markers={
        settings.modes.percentile && settings.percentiles.showMarkers
          ? compatible.length * settings.percentiles.values.length
          : 0
      }
    >
      <div
        className="absolute bottom-0 left-2 z-10 rounded bg-background/85 px-1.5 py-0.5 text-[9px] text-muted-foreground"
        data-testid="distribution-population"
        data-included={population.included}
        data-excluded={population.excluded}
        data-bin-count={population.binCount}
        data-bin-width={population.binWidth}
      >
        {population.binCount} {t("graphSeries.bins")} · {t("graphSeries.binWidth")}{" "}
        {formatNumber(population.binWidth, { maximumFractionDigits: 4 })} · {population.included}{" "}
        {t("graphSeries.included")} · {population.excluded} {t("graphSeries.excluded")}
      </div>
      <div
        ref={host}
        className="absolute inset-0"
        role="img"
        aria-label={`${xLabel}: ${settings.modes.histogram ? t("graphSeries.histogram") : ""} ${settings.modes.cdf ? settings.cdf.direction.toUpperCase() : ""} ${settings.modes.percentile ? t("graphSeries.percentile") : ""}`}
      />
    </div>
  );
}

/** 1.49.3 — Courbe (seq, t_rel_s, value) via /metrics/series pour une
 *  métrique Nemo. Auto-sélection de la 1re capture qui porte la
 *  métrique (via /metrics/captures). Reuse exact du contrat existant
 *  utilisé par Chronogram ; pas de nouveau endpoint back. */
function MetricTimePlot({
  projectId,
  code,
  label,
  unit,
  settings,
  onSettingsChange,
  onOpenDistributionSettings,
  syncId,
  timeAxisMode,
  eventsCaptureId,
  workspaceId,
  zoom,
  onZoomChange,
  prefetchedSeries,
  batchSeries,
  prefetchedSeriesPending,
  prefetchedSeriesError,
  onPrefetchedSeriesRetry,
}: {
  projectId: string;
  code: string;
  label: string;
  unit: string;
  settings: GraphSeriesSettings;
  onSettingsChange: (settings: GraphSeriesSettings) => void;
  onOpenDistributionSettings: () => void;
  syncId?: string | undefined;
  timeAxisMode?: TimeAxisMode | undefined;
  eventsCaptureId?: string | undefined;
  workspaceId?: string | undefined;
  zoom: MetricZoomWindow | null;
  onZoomChange: (zoom: MetricZoomWindow | null) => void;
  prefetchedSeries?: ChronogramData | undefined;
  batchSeries: boolean;
  prefetchedSeriesPending: boolean;
  prefetchedSeriesError?: unknown;
  onPrefetchedSeriesRetry?: (() => void) | undefined;
}) {
  const { t: translate } = useTranslation();
  const pointSync = usePointSync();
  const { active: activeEvents } = useActiveEvents();
  const captures = useQuery({
    queryKey: metricCapturesKey(projectId),
    queryFn: ({ signal }) => getMetricCaptures(projectId, {}, signal),
    staleTime: API_LEAN_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const captureId = eventsCaptureId ?? captures.data?.[0]?.capture_id;
  const codes = useMemo(
    () => settings.series.map((item) => item.code).sort((a, b) => a.localeCompare(b)),
    [settings.series],
  );
  const series = useQuery({
    queryKey: ["metric-series", projectId, captureId, codes],
    queryFn: ({ signal }) => getMetricSeries(projectId, captureId as string, codes, signal),
    enabled:
      !!captureId && codes.length > 0 && (!batchSeries || codes.some((item) => item !== code)),
    retry: false,
  });
  const baseOnly = codes.length === 1 && codes[0] === code;
  const seriesData = baseOnly && prefetchedSeries ? prefetchedSeries : series.data;
  const numericSeries = useMemo(
    () =>
      (seriesData?.series ?? []).map((item) => ({
        code: item.code,
        points: item.points
          .filter(
            (point): point is typeof point & { value: number } => typeof point.value === "number",
          )
          .map((point) => ({ seq: point.seq, t_rel_s: point.t_rel_s, value: point.value })),
      })),
    [seriesData],
  );
  // The shared timeline drives only X domain, brush and exact-time tooltips.
  // Every rendered series keeps its own source points below.
  const rows = useMemo(() => metricTimelineRows(numericSeries), [numericSeries]);
  const requestedSeries = settings.series;
  const seriesList = requestedSeries.map((requested) => {
    const api = seriesData?.series.find((item) => item.code === requested.code);
    const numeric = numericSeries.find((item) => item.code === requested.code)?.points ?? [];
    const renderMode = requested.display;
    const sourcePoints: MetricPlotPoint[] = (api?.points ?? [])
      .filter((point) => typeof point.value === "number" || point.value === null)
      .map((point) => ({
        seq: point.seq,
        t_rel_s: point.t_rel_s,
        value: typeof point.value === "number" ? point.value : null,
      }));
    return {
      ...requested,
      // API labels describe storage fields. Visible identity always comes
      // from the catalogue-resolved managed series.
      label: requested.label,
      unit: api?.unit ?? requested.unit,
      points: metricSeriesPlotPoints(
        sourcePoints,
        renderMode === "line" || renderMode === "point-line" ? "line" : "point",
      ),
      // Statistical views always use every numeric source sample. They must
      // not inherit the visual line downsampling used by the time graph.
      values: numeric.map((point) => point.value),
      renderMode,
    };
  });
  const rightAxis = seriesList.some((item) => item.axis === "right");
  const toggleSeries = (seriesCode: string) => {
    const next = {
      ...settings,
      series: settings.series.map((item) =>
        item.code === seriesCode ? { ...item, visible: !item.visible } : item,
      ),
    };
    onSettingsChange(next);
  };
  const effectiveZoom = normalizeMetricZoom(zoom, rows.length);
  const [visibleXMin, visibleXMax] = metricZoomDomain(rows, effectiveZoom);
  const effectiveDistributionModes = normalizeDistributionModes(settings.distribution.modes);
  const effectiveDistributionSettings = {
    ...settings.distribution,
    modes: effectiveDistributionModes,
  };
  const activeDistributionModes = (
    Object.keys(effectiveDistributionModes) as Array<keyof typeof effectiveDistributionModes>
  ).filter((mode) => effectiveDistributionModes[mode]);
  const statisticsActive = activeDistributionModes.length > 0;

  const plotRef = useRef<HTMLDivElement>(null);
  const renderProbe = useRef({ updateAt: 0, startedAt: 0 });
  if (series.dataUpdatedAt && renderProbe.current.updateAt !== series.dataUpdatedAt) {
    renderProbe.current = { updateAt: series.dataUpdatedAt, startedAt: performance.now() };
  }

  const selectedSeries = seriesData?.series?.[0];
  const points = useMemo(() => {
    const s = seriesData?.series?.[0];
    if (!s) return [];
    return (s.points ?? [])
      .filter((p) => typeof p.value === "number")
      .map((p) => ({ t_rel_s: p.t_rel_s, value: p.value as number, seq: p.seq }));
  }, [seriesData]);
  const categoricalPoints = useMemo(() => {
    const s = seriesData?.series?.[0];
    if (!s || s.kind !== "categorical") return [];
    return (s.points ?? []).map((point) => ({
      t_rel_s: point.t_rel_s,
      value: String(point.value),
      label: point.label ?? String(point.value),
      seq: point.seq,
    }));
  }, [seriesData]);
  const timeMeta: TimeAxisMeta | undefined = timeAxisMetaFromPayload(seriesData);
  const mode: TimeAxisMode = effectiveTimeAxisMode(timeAxisMode, timeMeta);
  const selectChartPoint = (state: unknown) => {
    if (!pointSync.enabled || !captureId) return;
    const active = state as {
      activePayload?: Array<{ payload?: { seq?: unknown; t_rel_s?: unknown } }>;
    };
    const payload = active.activePayload?.[0]?.payload;
    const seq = Number(payload?.seq);
    const tRelS = Number(payload?.t_rel_s);
    if (!Number.isFinite(seq)) return;
    if (
      pointSync.selection?.projectId === projectId &&
      pointSync.selection.captureId === captureId &&
      pointSync.selection.seq === seq
    ) {
      pointSync.select(null);
      return;
    }
    pointSync.select({
      projectId,
      workspaceId: workspaceId ?? "metrics",
      captureId,
      seq,
      seqLast: seq,
      tRelS: Number.isFinite(tRelS) ? tRelS : null,
      source: "graph",
    });
  };
  const selectedTime =
    pointSync.enabled &&
    pointSync.selection?.projectId === projectId &&
    pointSync.selection.captureId === captureId
      ? pointSync.selection.tRelS
      : null;
  // Different metrics do not necessarily cover the same source-time interval.
  // Keep the synchronized cursor truthful and visible by extending only the
  // displayed X domain; series points and RF values remain untouched.
  const synchronizedXMin =
    typeof selectedTime === "number" ? Math.min(visibleXMin, selectedTime) : visibleXMin;
  const synchronizedXMax =
    typeof selectedTime === "number" ? Math.max(visibleXMax, selectedTime) : visibleXMax;

  useEffect(() => {
    if (!series.data || !plotRef.current || !renderProbe.current.startedAt) return;
    const element = plotRef.current;
    const updateAt = series.dataUpdatedAt;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!element.isConnected || renderProbe.current.updateAt !== updateAt) return;
        const renderMs = performance.now() - renderProbe.current.startedAt;
        const pointCount = series.data.series.reduce((sum, item) => sum + item.points.length, 0);
        const resource = performance
          .getEntriesByType("resource")
          .filter(
            (entry) =>
              entry.name.includes("/metrics/series?") &&
              entry.name.includes(`capture_id=${encodeURIComponent(series.data.capture_id)}`),
          )
          .map((entry) => entry as PerformanceResourceTiming)
          .at(-1);
        const responseBytes =
          resource?.encodedBodySize || new Blob([JSON.stringify(series.data)]).size;
        element.dataset["renderMs"] = renderMs.toFixed(1);
        element.dataset["responseBytes"] = String(responseBytes);
        if (KPI_SERIES_RENDER_DEBUG) {
          console.info("[bc4:kpi-series-render]", {
            project_id: projectId,
            capture_id: captureId,
            metric: code,
            points: pointCount,
            response_bytes: responseBytes,
            network_ms: resource ? Number(resource.duration.toFixed(1)) : null,
            render_ms: Number(renderMs.toFixed(1)),
          });
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [captureId, code, projectId, series.data, series.dataUpdatedAt]);

  if (settings.series.length === 0)
    return (
      <div className="kpi-chart-state" role="status" data-testid="metric-series-empty">
        <strong>{translate("graphSeries.empty")}</strong>
        <button
          type="button"
          className="kpi-button mt-2"
          onClick={() => {
            const input = document.querySelector<HTMLInputElement>(
              '[data-testid="metrics-search"], input[placeholder*="Search metrics"], input[placeholder*="Rechercher"]',
            );
            input?.focus();
          }}
        >
          {translate("graphSeries.addMetric")}
        </button>
      </div>
    );

  if (!captureId) {
    if (captures.isPending) return <ChartSpinner label={translate("metrics.de3b78444032")} />;
    if (captures.isError)
      return (
        <QueryErrorState
          error={captures.error}
          title={translate("metrics.d854ce90120a")}
          onRetry={() => void captures.refetch()}
        />
      );
    return (
      <div className="kpi-chart-state" role="status">
        {" "}
        {translate("metrics.31a32f546ca5")}{" "}
      </div>
    );
  }
  if (!seriesData && (prefetchedSeriesPending || series.isPending))
    return <ChartSpinner label={translate("metrics.d90f3037b488")} />;
  if (!seriesData && prefetchedSeriesError)
    return (
      <QueryErrorState
        error={prefetchedSeriesError}
        title={translate("metrics.a0f3fe3387b3")}
        onRetry={onPrefetchedSeriesRetry ?? (() => undefined)}
      />
    );
  if (!seriesData && series.isError)
    return (
      <QueryErrorState
        error={series.error}
        title={translate("metrics.a0f3fe3387b3")}
        onRetry={() => void series.refetch()}
      />
    );
  if (
    !seriesList.some((item) => item.points.some((point) => point.value !== null)) &&
    !categoricalPoints.length
  )
    return (
      <div className="kpi-chart-state" role="status">
        {" "}
        {translate("metrics.fab2de7753e5")}{" "}
      </div>
    );

  if (selectedSeries?.kind === "categorical")
    return (
      <div
        ref={plotRef}
        className="w-full"
        style={{ minHeight: "var(--kpi-panel-chart-height, 235px)" }}
        data-testid="metric-categorical-plot"
        data-capture-id={captureId}
        data-n-points={categoricalPoints.length}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{ top: 24, right: 14, left: 4, bottom: 24 }}
            onClick={selectChartPoint}
          >
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              type="number"
              dataKey="t_rel_s"
              domain={[0, "dataMax"]}
              tickCount={6}
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickFormatter={(v: number) =>
                typeof v === "number" ? formatTimeTick(v, mode, timeMeta) : String(v)
              }
            />
            <YAxis
              type="category"
              dataKey="value"
              width={70}
              tick={{ fontSize: 10, fill: "#64748b" }}
              allowDuplicatedCategory={false}
            />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeDasharray: "2 2" }}
              formatter={(_value, _name, item) => [
                `${item.payload.label} · seq ${item.payload.seq}`,
                label,
              ]}
            />
            <Scatter data={categoricalPoints} fill="#2563eb" shape="diamond">
              <LabelList dataKey="label" position="top" fontSize={9} fill="#334155" />
            </Scatter>
            {typeof selectedTime === "number" && (
              <ReferenceLine
                x={selectedTime}
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                className="kpi-point-sync-line"
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );

  return (
    <div
      ref={plotRef}
      className="relative w-full"
      style={{ minHeight: "var(--kpi-panel-chart-height, 235px)" }}
      data-testid="metric-time-plot"
      data-capture-id={captureId}
      data-n-points={points.length}
      data-zoom-start={effectiveZoom?.startIndex ?? 0}
      data-zoom-end={effectiveZoom?.endIndex ?? Math.max(0, rows.length - 1)}
      data-x-min={synchronizedXMin}
      data-x-max={synchronizedXMax}
      data-series-count={seriesList.length}
      data-series-render={seriesList.map((item) => `${item.code}:${item.renderMode}`).join(",")}
      data-series-colors={seriesList.map((item) => `${item.code}:${item.color}`).join(",")}
      data-series-line-widths={seriesList.map((item) => `${item.code}:${item.lineWidth}`).join(",")}
      data-series-marker-sizes={seriesList
        .map((item) => `${item.code}:${item.markerSize}`)
        .join(",")}
      data-series-order={seriesList.map((item) => item.code).join(",")}
      data-series-visible={seriesList
        .map((item) => `${item.code}:${item.visible ? "on" : "off"}`)
        .join(",")}
      data-series-axes={seriesList.map((item) => `${item.code}:${item.axis}`).join(",")}
      data-left-axis={`${settings.axes.left.auto ? "auto" : `${settings.axes.left.min ?? "auto"}:${settings.axes.left.max ?? "auto"}`}|${settings.axes.left.unit}|${settings.axes.left.visible ? "shown" : "hidden"}`}
      data-right-axis={`${settings.axes.right.auto ? "auto" : `${settings.axes.right.min ?? "auto"}:${settings.axes.right.max ?? "auto"}`}|${settings.axes.right.unit}|${settings.axes.right.visible ? "shown" : "hidden"}`}
      data-analysis-mode={statisticsActive ? activeDistributionModes.join("+") : "timeline"}
    >
      <div
        className="absolute right-3 top-1 z-10 inline-flex rounded-md border border-border bg-background/95 p-0.5 shadow-sm"
        data-testid="metric-distribution-controls"
      >
        {(["histogram", "cdf", "percentile"] as const).map((analysisMode) => (
          <button
            key={analysisMode}
            type="button"
            data-testid={`metric-analysis-${analysisMode}`}
            aria-pressed={effectiveDistributionModes[analysisMode]}
            title={translate("graphSeries.distributionToggleHint")}
            className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              effectiveDistributionModes[analysisMode]
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => {
              const modes = toggleDistributionMode(effectiveDistributionModes, analysisMode);
              const active = (["histogram", "cdf", "percentile"] as const).filter(
                (mode) => modes[mode],
              );
              onSettingsChange({
                ...settings,
                analysisMode: active[0] ?? "timeline",
                distribution: { ...settings.distribution, modes },
              });
            }}
          >
            {translate(`graphSeries.${analysisMode}`)}
          </button>
        ))}
        <button
          type="button"
          data-testid="metric-analysis-settings"
          title={translate("graphSeries.histogramSettings")}
          className="rounded px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onOpenDistributionSettings}
        >
          <SlidersHorizontal size={13} />
        </button>
      </div>
      {statisticsActive && (
        <div className="absolute inset-0">
          <MetricDistributionPlot settings={effectiveDistributionSettings} series={seriesList} />
        </div>
      )}
      <ResponsiveContainer
        width="100%"
        height="100%"
        className={statisticsActive ? "invisible pointer-events-none" : ""}
      >
        <ComposedChart
          data={rows}
          margin={{ top: 10, right: 14, left: 4, bottom: 24 }}
          onClick={selectChartPoint}
          {...(syncId ? { syncId } : {})}
        >
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            dataKey="t_rel_s"
            domain={[synchronizedXMin, synchronizedXMax]}
            allowDataOverflow
            tickCount={6}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickFormatter={(v: number) =>
              typeof v === "number" ? formatTimeTick(v, mode, timeMeta) : String(v)
            }
          />
          <YAxis
            yAxisId="left"
            width={64}
            hide={!settings.axes.left.visible}
            domain={graphAxisDomain(settings.axes.left)}
            stroke={settings.axes.left.color}
            tick={{ fontSize: 10, fill: settings.axes.left.color }}
            {...(settings.axes.left.unit
              ? {
                  label: {
                    value: settings.axes.left.unit,
                    angle: -90,
                    position: "insideLeft",
                    fill: settings.axes.left.color,
                  },
                }
              : {})}
          />
          {rightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              width={64}
              hide={!settings.axes.right.visible}
              domain={graphAxisDomain(settings.axes.right)}
              stroke={settings.axes.right.color}
              tick={{ fontSize: 10, fill: settings.axes.right.color }}
              {...(settings.axes.right.unit
                ? {
                    label: {
                      value: settings.axes.right.unit,
                      angle: 90,
                      position: "insideRight",
                      fill: settings.axes.right.color,
                    },
                  }
                : {})}
            />
          )}
          {seriesList.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 10, maxWidth: "calc(100% - 12px)" }}
              content={() => (
                <div
                  className="flex max-w-full flex-wrap justify-center gap-x-2 gap-y-1"
                  data-testid="metric-series-legend"
                >
                  {seriesList.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      title={`${item.label} · ${item.unit || "—"}`}
                      aria-pressed={item.visible}
                      className={`inline-flex max-w-[220px] items-center gap-1 truncate ${item.visible ? "" : "opacity-45"}`}
                      onClick={() => toggleSeries(item.code)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        const article = event.currentTarget.closest("article");
                        article
                          ?.querySelector<HTMLButtonElement>('[data-testid="workspace-panel-menu"]')
                          ?.click();
                        requestAnimationFrame(() =>
                          document
                            .querySelector<HTMLButtonElement>(
                              '[data-testid="metric-manage-series-trigger"]',
                            )
                            ?.click(),
                        );
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate">
                        {item.label}
                        {item.unit ? ` · ${item.unit}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            />
          )}
          <Tooltip
            shared={false}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "2 2" }}
            contentStyle={{ fontSize: 11, padding: "4px 8px" }}
            formatter={(value: number, name: string) => {
              const found = seriesList.find((s) => s.label === name);
              const u = found?.unit ?? unit;
              return [`${value}${u ? " " + u : ""}`, name];
            }}
            labelFormatter={(l: number) => {
              if (typeof l !== "number") return String(l);
              const trip = tooltipTriple(l, timeMeta);
              // 1.99.1 — tooltip montre les 3 valeurs + seq (si disponible).
              const parts = [
                trip.local ? `Local ${trip.local}` : null,
                trip.utc ? `UTC ${trip.utc}` : null,
                `${trip.capture}`,
              ].filter(Boolean) as string[];
              return parts.join(" · ");
            }}
          />
          {seriesList.flatMap((s) => {
            const numericPoints = s.points.filter(
              (point): point is MetricPlotPoint & { value: number } => point.value !== null,
            );
            if (s.renderMode === "point") {
              return [
                <Scatter
                  key={s.code}
                  yAxisId={s.axis}
                  data={numericPoints}
                  dataKey="value"
                  name={s.label}
                  fill={s.color}
                  shape={<MetricPointShape radius={s.markerSize / 2} color={s.color} />}
                  hide={!s.visible}
                  isAnimationActive={false}
                />,
              ];
            }
            if (s.renderMode === "point-line") {
              return [
                <Line
                  key={`${s.code}:line`}
                  yAxisId={s.axis}
                  type="linear"
                  data={s.points}
                  dataKey="value"
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={s.lineWidth}
                  {...GRAPH_LINE_MARKERS}
                  connectNulls={false}
                  hide={!s.visible}
                  isAnimationActive={false}
                />,
                <Scatter
                  key={`${s.code}:points`}
                  yAxisId={s.axis}
                  data={numericPoints}
                  dataKey="value"
                  name={s.label}
                  fill={s.color}
                  shape={<MetricPointShape radius={s.markerSize / 2} color={s.color} />}
                  hide={!s.visible}
                  isAnimationActive={false}
                />,
              ];
            }
            if (s.renderMode === "bar") {
              return [
                <Bar
                  key={s.code}
                  yAxisId={s.axis}
                  data={numericPoints}
                  dataKey="value"
                  name={s.label}
                  fill={s.color}
                  hide={!s.visible}
                  isAnimationActive={false}
                />,
              ];
            }
            return [
              <Line
                key={s.code}
                yAxisId={s.axis}
                type="linear"
                data={s.points}
                dataKey="value"
                name={s.label}
                stroke={s.color}
                strokeWidth={s.lineWidth}
                {...GRAPH_LINE_MARKERS}
                connectNulls={false}
                hide={!s.visible}
                isAnimationActive={false}
              />,
            ];
          })}
          {activeEvents
            .filter(
              (e) =>
                e.captureId === captureId && (!eventsCaptureId || e.captureId === eventsCaptureId),
            )
            .map((e) => (
              <ReferenceLine
                key={e.id}
                yAxisId="left"
                x={e.t_rel_s}
                stroke={e.color}
                strokeWidth={2}
                ifOverflow="hidden"
                className="kpi-event-line"
                label={{ value: e.label, position: "insideTopRight", fontSize: 9, fill: e.color }}
              />
            ))}
          {typeof selectedTime === "number" && (
            <ReferenceLine
              yAxisId="left"
              x={selectedTime}
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              className="kpi-point-sync-line"
            />
          )}
          {points.length > 50 ? (
            <Brush
              dataKey="t_rel_s"
              height={16}
              travellerWidth={7}
              stroke="#94a3b8"
              fill="#f1f5f9"
              startIndex={effectiveZoom?.startIndex ?? 0}
              endIndex={effectiveZoom?.endIndex ?? rows.length - 1}
              onChange={(window) => {
                if (typeof window.startIndex !== "number" || typeof window.endIndex !== "number")
                  return;
                onZoomChange(
                  normalizeMetricZoom(
                    { startIndex: window.startIndex, endIndex: window.endIndex },
                    rows.length,
                  ),
                );
              }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
