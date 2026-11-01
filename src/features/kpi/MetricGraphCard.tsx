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
  MapPin,
  Maximize2,
  Palette,
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
import { toast } from "sonner";
import { MAP_METRIC_MIME, readMapMetric } from "./map-metric-drop";
import {
  addGraphSeries,
  axisOf,
  readGraphSeries,
  writeGraphSeries,
  type GraphSeries,
} from "./graph-series-drop";
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
import { operatorColor } from "./workspace-model";
import {
  formatTick as formatTimeTick,
  tooltipTriple,
  type TimeAxisMeta,
  type TimeAxisMode,
} from "./time-axis";

const KPI_SERIES_RENDER_DEBUG = import.meta.env["VITE_KPI_SERIES_RENDER_DEBUG"] === "1";

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
  style: styleProp,
  onStyleChange,
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
  style?: MetricStyle | undefined;
  onStyleChange?: ((style: MetricStyle) => void) | undefined;
}) {
  const { t: translate } = useTranslation();
  const [localView, setLocalView] = useState<MetricView>("histogram");
  const view = viewProp ?? localView;
  const setView = (v: MetricView) => {
    setLocalView(v);
    onViewChange?.(v);
  };
  const cardRef = useRef<HTMLElement>(null);
  // Style du graphe (tracé + couleur) : mémorisé par onglet par le parent.
  const style = styleProp ?? DEFAULT_METRIC_STYLE;
  const setStyle = (next: MetricStyle) => onStyleChange?.(next);
  // Séries ajoutées par glisser-déposer : propres à cette carte, mémorisées.
  const [extra, setExtra] = useState<GraphSeries[]>(() => readGraphSeries(workspaceId, code));
  const [over, setOver] = useState(false);
  const saveExtra = (next: GraphSeries[]) => {
    setExtra(next);
    writeGraphSeries(workspaceId, code, next);
  };
  const dropMetric = (raw: string) => {
    const metric = readMapMetric(raw);
    if (!metric) return;
    if (metric.kind !== "metric") {
      toast.error(translate("graphSeries.kpiUnsupported"));
      return;
    }
    const result = addGraphSeries(
      extra,
      { code: metric.code, label: metric.label, unit: metric.unit },
      { code, unit },
    );
    if (!result.ok) {
      toast.error(
        translate(result.reason === "duplicate" ? "graphSeries.duplicate" : "graphSeries.axis"),
      );
      return;
    }
    saveExtra(result.series);
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
            <h3 title={label}>{label}</h3>
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
                      onClick={() => setStyle({ ...style, color })}
                      className="h-5 w-5 rounded-sm border border-border"
                      style={{
                        background: color,
                        outline: color === style.color ? "2px solid currentColor" : "none",
                        outlineOffset: 1,
                      }}
                    />
                  ))}
                </div>
                {extra.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{translate("panel.series")}</DropdownMenuLabel>
                    {extra.map((s) => (
                      <DropdownMenuItem
                        key={s.code}
                        data-testid={`metric-series-remove-${s.code}`}
                        onSelect={() => saveExtra(extra.filter((x) => x.code !== s.code))}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: s.color }}
                        />
                        <span className="min-w-0 flex-1 truncate">{s.label}</span>
                        <X size={13} />
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
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
        </div>
      </header>
      {view === "histogram" ? (
        <MetricAggregatePlot
          projectId={projectId}
          code={code}
          label={label}
          unit={unit}
          appliedFilters={appliedFilters}
        />
      ) : view === "graph" ? (
        <MetricTimePlot
          projectId={projectId}
          code={code}
          label={label}
          unit={unit}
          color={style.color}
          plot={style.plot}
          extra={extra}
          syncId={syncId}
          timeAxisMode={timeAxisMode}
          eventsCaptureId={eventsCaptureId}
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
  const query = useQuery({
    queryKey: ["metric-aggregate", projectId, code, "operator", appliedFilters],
    queryFn: ({ signal }) =>
      getMetricAggregate(projectId, code, "operator", appliedFilters, signal),
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
  const query = useQuery({
    queryKey: ["metric-aggregate", projectId, code, "operator", appliedFilters],
    queryFn: ({ signal }) =>
      getMetricAggregate(projectId, code, "operator", appliedFilters, signal),
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

/** 1.49.3 — Courbe (seq, t_rel_s, value) via /metrics/series pour une
 *  métrique Nemo. Auto-sélection de la 1re capture qui porte la
 *  métrique (via /metrics/captures). Reuse exact du contrat existant
 *  utilisé par Chronogram ; pas de nouveau endpoint back. */
function MetricTimePlot({
  projectId,
  code,
  label,
  unit,
  color,
  plot,
  extra,
  syncId,
  timeAxisMode,
  eventsCaptureId,
}: {
  projectId: string;
  code: string;
  label: string;
  unit: string;
  color: string;
  plot: MetricPlot;
  extra: GraphSeries[];
  syncId?: string | undefined;
  timeAxisMode?: TimeAxisMode | undefined;
  eventsCaptureId?: string | undefined;
}) {
  const { t: translate } = useTranslation();
  const { active: activeEvents } = useActiveEvents();
  const captures = useQuery({
    queryKey: metricCapturesKey(projectId),
    queryFn: ({ signal }) => getMetricCaptures(projectId, {}, signal),
    staleTime: API_LEAN_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const captureId = captures.data?.[0]?.capture_id;
  // Séries de la carte : la métrique de base + celles ajoutées par dépôt.
  const codes = useMemo(() => [code, ...extra.map((s) => s.code)], [code, extra]);
  const series = useQuery({
    queryKey: ["metric-series", projectId, captureId, codes],
    queryFn: ({ signal }) => getMetricSeries(projectId, captureId as string, codes, signal),
    enabled: !!captureId,
    retry: false,
  });
  // Une ligne par échantillon (seq partagé par toutes les séries de la même
  // capture) : aucune interpolation, une série sans échantillon à ce seq est
  // simplement absente.
  const rows = useMemo(() => {
    const bySeq = new Map<number, Record<string, number>>();
    for (const s of series.data?.series ?? []) {
      for (const p of s.points ?? []) {
        if (typeof p.value !== "number") continue;
        const row = bySeq.get(p.seq) ?? { t_rel_s: p.t_rel_s };
        row[s.code] = p.value;
        bySeq.set(p.seq, row);
      }
    }
    return [...bySeq.entries()].sort((a, b) => a[0] - b[0]).map(([seq, row]) => ({ seq, ...row }));
  }, [series.data]);
  const units = [unit, ...extra.map((s) => s.unit)];
  const seriesList = [
    { code, label, unit, color },
    ...extra.map((s) => ({ code: s.code, label: s.label, unit: s.unit, color: s.color })),
  ];
  const axisFor = (value: string) => axisOf(units, value) ?? "left";
  const rightAxis = seriesList.some((s) => axisFor(s.unit) === "right");

  const plotRef = useRef<HTMLDivElement>(null);
  const renderProbe = useRef({ updateAt: 0, startedAt: 0 });
  if (series.dataUpdatedAt && renderProbe.current.updateAt !== series.dataUpdatedAt) {
    renderProbe.current = { updateAt: series.dataUpdatedAt, startedAt: performance.now() };
  }

  const selectedSeries = series.data?.series?.[0];
  const points = useMemo(() => {
    const s = series.data?.series?.[0];
    if (!s) return [];
    return (s.points ?? [])
      .filter((p) => typeof p.value === "number")
      .map((p) => ({ t_rel_s: p.t_rel_s, value: p.value as number, seq: p.seq }));
  }, [series.data]);
  const categoricalPoints = useMemo(() => {
    const s = series.data?.series?.[0];
    if (!s || s.kind !== "categorical") return [];
    return (s.points ?? []).map((point) => ({
      t_rel_s: point.t_rel_s,
      value: String(point.value),
      label: point.label ?? String(point.value),
      seq: point.seq,
    }));
  }, [series.data]);
  const timeMeta: TimeAxisMeta | undefined = series.data
    ? {
        nmf_start_at: series.data.nmf_start_at ?? null,
        origin_ts: series.data.origin_ts,
        utc_offset_min: series.data.utc_offset_min ?? null,
        capture_date: series.data.capture_date ?? null,
      }
    : undefined;
  const mode: TimeAxisMode = timeAxisMode ?? "capture";

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
  if (series.isPending) return <ChartSpinner label={translate("metrics.d90f3037b488")} />;
  if (series.isError)
    return (
      <QueryErrorState
        error={series.error}
        title={translate("metrics.a0f3fe3387b3")}
        onRetry={() => void series.refetch()}
      />
    );
  if (!points.length && !categoricalPoints.length)
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
        style={{ height: "var(--kpi-panel-chart-height, 235px)" }}
        data-testid="metric-categorical-plot"
        data-capture-id={captureId}
        data-n-points={categoricalPoints.length}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 24, right: 14, left: 4, bottom: 24 }}>
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
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );

  return (
    <div
      ref={plotRef}
      className="w-full"
      style={{ height: "var(--kpi-panel-chart-height, 235px)" }}
      data-testid="metric-time-plot"
      data-capture-id={captureId}
      data-n-points={points.length}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: 10, right: 14, left: 4, bottom: 24 }}
          {...(syncId ? { syncId } : {})}
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
            yAxisId="left"
            width={54}
            domain={["auto", "auto"]}
            tick={{ fontSize: 10, fill: "#64748b" }}
          />
          {rightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              width={54}
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "#64748b" }}
            />
          )}
          {seriesList.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} iconSize={9} />}
          <Tooltip
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
          {seriesList.map((s) =>
            plot === "bar" ? (
              <Bar
                key={s.code}
                yAxisId={axisFor(s.unit)}
                dataKey={s.code}
                name={s.label}
                fill={s.color}
                barSize={6}
                isAnimationActive={false}
              />
            ) : plot === "point" ? (
              <Scatter
                key={s.code}
                yAxisId={axisFor(s.unit)}
                dataKey={s.code}
                name={s.label}
                fill={s.color}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={s.code}
                yAxisId={axisFor(s.unit)}
                type="linear"
                dataKey={s.code}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ),
          )}
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
          {points.length > 50 ? (
            <Brush
              dataKey="t_rel_s"
              height={16}
              travellerWidth={7}
              stroke="#94a3b8"
              fill="#f1f5f9"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
