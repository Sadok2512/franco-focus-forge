import { formatNumber } from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ECharts, EChartsOption } from "echarts";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, ChartNoAxesCombined, MapPin, Maximize2, Table2, X } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { WorkspacePanelMenu } from "./WorkspacePanelMenu";
import { usePanelTableSettings } from "./table-settings";
import { getMetricAggregate, getMetricCaptures, getMetricSeries } from "@/lib/api/metrics";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { operatorColor } from "./workspace-model";

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
}) {
  const { t: translate } = useTranslation();
  const [localView, setLocalView] = useState<MetricView>("histogram");
  const view = viewProp ?? localView;
  const setView = (v: MetricView) => {
    setLocalView(v);
    onViewChange?.(v);
  };
  const cardRef = useRef<HTMLElement>(null);
  return (
    <article
      ref={cardRef}
      id={`metric-graph-${code}`}
      className="kpi-graph-card"
      data-metric-code={code}
      data-view={view}
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
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void cardRef.current?.requestFullscreen?.()}>
              <Maximize2 size={14} /> {translate("panel.fullscreen")}
            </DropdownMenuItem>
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
        <MetricTimePlot projectId={projectId} code={code} label={label} unit={unit} syncId={syncId} />
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
    return (
      <div className="kpi-chart-state animate-pulse" role="status">
        {" "}
        {translate("metrics.fc725ec040f4")}{" "}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="kpi-chart-state" role="alert">
        <strong>{translate("metrics.f82af3f196cf")}</strong>
        <p>{query.error.message}</p>
      </div>
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
      style={{ height: "var(--kpi-panel-chart-height, 235px)" }}
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
  });
  if (query.isPending)
    return (
      <div className="kpi-chart-state animate-pulse" role="status">
        {" "}
        {translate("metrics.fc725ec040f4")}{" "}
      </div>
    );
  if (query.isError)
    return (
      <div className="kpi-chart-state" role="alert">
        <strong>{translate("metrics.f82af3f196cf")}</strong>
        <p>{query.error.message}</p>
      </div>
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
  syncId,
}: {
  projectId: string;
  code: string;
  label: string;
  unit: string;
  syncId?: string | undefined;
}) {
  const { t: translate } = useTranslation();
  const captures = useQuery({
    queryKey: ["metric-captures", projectId],
    queryFn: ({ signal }) => getMetricCaptures(projectId, {}, signal),
  });
  const captureId = captures.data?.[0]?.capture_id;
  const series = useQuery({
    queryKey: ["metric-series", projectId, captureId, code],
    queryFn: ({ signal }) => getMetricSeries(projectId, captureId as string, [code], signal),
    enabled: !!captureId,
  });

  const points = useMemo(() => {
    const s = series.data?.series?.[0];
    if (!s) return [];
    return (s.points ?? [])
      .filter((p) => typeof p.value === "number")
      .map((p) => ({ t_rel_s: p.t_rel_s, value: p.value as number }));
  }, [series.data]);

  if (!captureId) {
    if (captures.isPending)
      return (
        <div className="kpi-chart-state animate-pulse" role="status">
          {" "}
          {translate("metrics.de3b78444032")}{" "}
        </div>
      );
    return (
      <div className="kpi-chart-state" role="status">
        {" "}
        {translate("metrics.31a32f546ca5")}{" "}
      </div>
    );
  }
  if (series.isPending)
    return (
      <div className="kpi-chart-state animate-pulse" role="status">
        {" "}
        {translate("metrics.d90f3037b488")}{" "}
      </div>
    );
  if (series.isError)
    return (
      <div className="kpi-chart-state" role="alert">
        <strong>{translate("metrics.a0f3fe3387b3")}</strong>
        <p>{series.error.message}</p>
      </div>
    );
  if (!points.length)
    return (
      <div className="kpi-chart-state" role="status">
        {" "}
        {translate("metrics.fab2de7753e5")}{" "}
      </div>
    );

  return (
    <div
      className="w-full"
      style={{ height: "var(--kpi-panel-chart-height, 235px)" }}
      data-testid="metric-time-plot"
      data-capture-id={captureId}
      data-n-points={points.length}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
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
              typeof v === "number"
                ? formatNumber(v, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " s"
                : String(v)
            }
          />
          <YAxis width={54} domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#64748b" }} />
          <Tooltip
            cursor={{ stroke: "#94a3b8", strokeDasharray: "2 2" }}
            contentStyle={{ fontSize: 11, padding: "4px 8px" }}
            formatter={(value: number) => [`${value}${unit ? " " + unit : ""}`, label]}
            labelFormatter={(l: number) =>
              typeof l === "number"
                ? `${formatNumber(l, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} s`
                : String(l)
            }
          />
          <Line
            type="linear"
            dataKey="value"
            stroke="#1d4ed8"
            strokeWidth={1.2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {points.length > 50 ? (
            <Brush
              dataKey="t_rel_s"
              height={16}
              travellerWidth={7}
              stroke="#94a3b8"
              fill="#f1f5f9"
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
