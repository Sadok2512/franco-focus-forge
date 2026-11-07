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
import { readHiddenGraphSeries, readGraphSeries } from "./graph-series-drop";
import {
  addManagedSeries,
  canAssignSeriesAxis,
  defaultAxisSettings,
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
  histogramRows,
  percentilePoints,
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
export function sortedMetricPoints(points: readonly MetricNumericPoint[]): MetricNumericPoint[] {
  return [...points].sort((a, b) => a.t_rel_s - b.t_rel_s || a.seq - b.seq);
}

export function metricSeriesRenderMode(
  requested: MetricPlot,
  points: readonly MetricNumericPoint[],
): MetricPlot {
  if (requested !== "line") return requested;
  const timestamps = new Set<number>();
  for (const point of points) {
    if (timestamps.has(point.t_rel_s)) return "point";
    timestamps.add(point.t_rel_s);
  }
  return "line";
}

/** Break a continuous line across a real acquisition gap without dropping or
 * interpolating observations. The null marker is presentation-only and lies
 * between two retained source samples. */
export function metricSeriesPlotPoints(
  points: readonly MetricNumericPoint[],
  mode: MetricPlot,
): MetricPlotPoint[] {
  const ordered = sortedMetricPoints(points);
  if (mode !== "line" || ordered.length < 3) return ordered;
  const deltas = ordered
    .slice(1)
    .map((point, index) => point.t_rel_s - ordered[index]!.t_rel_s)
    .filter((delta) => delta > 0)
    .sort((a, b) => a - b);
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)]! : 0;
  if (!(median > 0)) return ordered;
  const gapLimit = Math.max(10, median * 5);
  const plotted: MetricPlotPoint[] = [];
  for (const point of ordered) {
    const previous = plotted.at(-1);
    if (previous && previous.value !== null && point.t_rel_s - previous.t_rel_s > gapLimit) {
      plotted.push({
        seq: previous.seq,
        t_rel_s: previous.t_rel_s + (point.t_rel_s - previous.t_rel_s) / 2,
        value: null,
      });
    }
    plotted.push(point);
  }
  return plotted;
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
                        <option value="point-line">{t("graphSeries.pointsLine")}</option>
                      </select>
                    </label>
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
  const buildInitialSeriesSettings = () =>
    readGraphSeriesSettings(workspaceId, seriesSettingsId, displayName) ??
    buildDefaultSeriesSettings();
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
      ? { ...resolvedSeriesSettings, analysisMode: "histogram" as const }
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
                  return (
                    <DropdownMenuItem
                      key={mode}
                      data-testid={`metric-plot-${mode}`}
                      onSelect={(event) => {
                        // Le menu reste ouvert : la couleur se choisit juste en
                        // dessous, sans devoir tout rouvrir.
                        event.preventDefault();
                        setStyle({ ...style, plot: mode });
                      }}
                    >
                      <Icon size={14} />
                      {translate(`panel.plot_${mode}`)}
                      {mode === style.plot ? " ✓" : ""}
                    </DropdownMenuItem>
                  );
                })}
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
                        setStyle({ ...style, color });
                        saveSeriesSettings({
                          ...seriesSettings,
                          series: seriesSettings.series.map((item) =>
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
            <ManageGraphSeriesPopover
              settings={resolvedSeriesSettings}
              onChange={saveSeriesSettings}
              open={seriesManagerOpen}
              onOpenChange={setSeriesManagerOpen}
              onClose={() => setSeriesManagerOpen(false)}
            />
          )}
        </div>
      </header>
      {view === "histogram" || view === "graph" ? (
        <MetricTimePlot
          projectId={projectId}
          code={code}
          label={label}
          unit={unit}
          plot={style.plot}
          settings={renderedSeriesSettings}
          onSettingsChange={saveSeriesSettings}
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
};

function MetricDistributionPlot({
  mode,
  series,
}: {
  mode: Exclude<GraphAnalysisMode, "timeline">;
  series: DistributionRenderSeries[];
}) {
  const { t } = useTranslation();
  const visible = series.filter((item) => item.visible);
  const histogram = useMemo(
    () =>
      histogramRows(
        visible.map((item) => ({
          code: item.code,
          values: item.points.flatMap((point) =>
            typeof point.value === "number" ? [point.value] : [],
          ),
        })),
      ),
    [visible],
  );
  const curves = useMemo(
    () =>
      series.map((item) => {
        const values = item.points.flatMap((point) =>
          typeof point.value === "number" ? [point.value] : [],
        );
        return {
          ...item,
          distribution:
            mode === "cdf"
              ? cdfPoints(values)
              : mode === "percentile"
                ? percentilePoints(values)
                : [],
        };
      }),
    [mode, series],
  );
  const rightAxis = mode === "percentile" && series.some((item) => item.axis === "right");
  const xLabel =
    mode === "percentile"
      ? t("graphSeries.percentileAxis")
      : visible.length === 1
        ? visible[0]?.unit
        : t("graphSeries.valueAxis");
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={mode === "histogram" ? histogram : []}
        margin={{ top: 38, right: 20, left: 8, bottom: 22 }}
      >
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis
          type="number"
          dataKey="x"
          domain={mode === "percentile" ? [0, 100] : ["dataMin", "dataMax"]}
          tick={{ fontSize: 10, fill: "#64748b" }}
          label={{ value: xLabel, position: "insideBottom", offset: -12, fontSize: 10 }}
        />
        {mode === "percentile" ? (
          <>
            <YAxis
              yAxisId="left"
              width={64}
              tick={{ fontSize: 10, fill: "#64748b" }}
              label={{
                value: series.find((item) => item.axis === "left")?.unit ?? "",
                angle: -90,
                position: "insideLeft",
              }}
            />
            {rightAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                width={64}
                tick={{ fontSize: 10, fill: "#64748b" }}
                label={{
                  value: series.find((item) => item.axis === "right")?.unit ?? "",
                  angle: 90,
                  position: "insideRight",
                }}
              />
            )}
          </>
        ) : (
          <YAxis
            yAxisId="distribution"
            width={58}
            domain={mode === "cdf" ? [0, 100] : [0, "auto"]}
            tick={{ fontSize: 10, fill: "#64748b" }}
            label={{
              value: mode === "cdf" ? t("graphSeries.cumulativePercent") : t("graphSeries.count"),
              angle: -90,
              position: "insideLeft",
            }}
          />
        )}
        <Tooltip
          contentStyle={{ fontSize: 11, padding: "4px 8px" }}
          labelFormatter={(value: number) =>
            mode === "percentile"
              ? `${t("graphSeries.percentile")}: ${formatNumber(value, { maximumFractionDigits: 1 })}%`
              : `${t("graphSeries.valueAxis")}: ${formatNumber(value, { maximumFractionDigits: 3 })}`
          }
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        {mode === "histogram"
          ? series.map((item) => (
              <Bar
                key={item.code}
                yAxisId="distribution"
                dataKey={item.code}
                name={item.label}
                fill={item.color}
                hide={!item.visible}
                opacity={0.72}
                isAnimationActive={false}
              />
            ))
          : curves.map((item) => (
              <Line
                key={item.code}
                yAxisId={mode === "percentile" ? item.axis : "distribution"}
                data={item.distribution}
                dataKey="y"
                name={item.label}
                stroke={item.color}
                strokeWidth={1.6}
                type={mode === "cdf" ? "stepAfter" : "linear"}
                dot={false}
                hide={!item.visible}
                isAnimationActive={false}
              />
            ))}
      </ComposedChart>
    </ResponsiveContainer>
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
  plot,
  settings,
  onSettingsChange,
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
  plot: MetricPlot;
  settings: GraphSeriesSettings;
  onSettingsChange: (settings: GraphSeriesSettings) => void;
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
    return {
      ...requested,
      // API labels describe storage fields. Visible identity always comes
      // from the catalogue-resolved managed series.
      label: requested.label,
      unit: api?.unit ?? requested.unit,
      points: metricSeriesPlotPoints(
        numeric,
        renderMode === "line" || renderMode === "point-line" ? "line" : "point",
      ),
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
              <ReferenceLine x={selectedTime} stroke="#2563eb" strokeWidth={2} />
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
      data-x-min={visibleXMin}
      data-x-max={visibleXMax}
      data-series-count={seriesList.length}
      data-series-render={seriesList.map((item) => `${item.code}:${item.renderMode}`).join(",")}
      data-series-order={seriesList.map((item) => item.code).join(",")}
      data-series-visible={seriesList
        .map((item) => `${item.code}:${item.visible ? "on" : "off"}`)
        .join(",")}
      data-series-axes={seriesList.map((item) => `${item.code}:${item.axis}`).join(",")}
      data-left-axis={`${settings.axes.left.auto ? "auto" : `${settings.axes.left.min ?? "auto"}:${settings.axes.left.max ?? "auto"}`}|${settings.axes.left.unit}|${settings.axes.left.visible ? "shown" : "hidden"}`}
      data-right-axis={`${settings.axes.right.auto ? "auto" : `${settings.axes.right.min ?? "auto"}:${settings.axes.right.max ?? "auto"}`}|${settings.axes.right.unit}|${settings.axes.right.visible ? "shown" : "hidden"}`}
      data-analysis-mode={settings.analysisMode}
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
            aria-pressed={settings.analysisMode === analysisMode}
            title={translate("graphSeries.distributionToggleHint")}
            className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              settings.analysisMode === analysisMode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() =>
              onSettingsChange({
                ...settings,
                analysisMode: settings.analysisMode === analysisMode ? "timeline" : analysisMode,
              })
            }
          >
            {translate(`graphSeries.${analysisMode}`)}
          </button>
        ))}
      </div>
      {settings.analysisMode !== "timeline" && (
        <div className="absolute inset-0">
          <MetricDistributionPlot mode={settings.analysisMode} series={seriesList} />
        </div>
      )}
      <ResponsiveContainer
        width="100%"
        height="100%"
        className={settings.analysisMode === "timeline" ? "" : "invisible pointer-events-none"}
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
            domain={[visibleXMin, visibleXMax]}
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
                  strokeWidth={1.2}
                  dot={false}
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
                strokeWidth={1.2}
                dot={false}
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
              strokeWidth={2}
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
