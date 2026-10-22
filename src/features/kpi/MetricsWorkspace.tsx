import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { arrangeRows, orderedColumns, textFor, useTableSettings } from "./table-settings";
import i18n from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ECharts, EChartsOption } from "echarts";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { Download, Maximize2, X } from "lucide-react";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { WorkspacePanelMenu } from "./WorkspacePanelMenu";
import { Button } from "@/components/ui/button";
import { getMetricAnalysis, getMetricCaptures } from "@/lib/api/client";
import type { MetricAnalysis, MetricInfo } from "@/lib/api/metrics-schemas";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { KpiMapOSM } from "./KpiMapOSM";
import { MetricGraphCard, type MetricView } from "./MetricGraphCard";
import { PanelShell } from "./PanelShell";

// 1.81.0 — Spec BC4_PREMIUM_ADAPTIVE_METRICS_TABLE_V1 Phase 1
// Reconstitue le timestamp UTC absolu depuis le label de capture
// (ex. "M1_FREE_DL-7Go_Max-10_W30_26Jun23_103320.4.nmf" → 2023-06-26)
// + l'origin_ts du back (ex. "10:33:20.980") + t_rel_s de chaque row.
function extractCaptureDate(label: string | undefined): string | null {
  if (!label) return null;
  const m = label.match(/_(\d{2})([A-Za-z]{3})(\d{2})_/);
  if (!m) return null;
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const [, d, monAbbr, yy] = m;
  const mon = months[monAbbr!] ?? "01";
  return `20${yy}-${mon}-${d}`;
}
function formatUtc(date: string | null, t_rel_s: number, originTs: string | null): string {
  if (!date || !originTs) return "—";
  // originTs = "HH:MM:SS.mmm" → add t_rel_s seconds
  const parts = originTs.split(":");
  if (parts.length !== 3) return "—";
  const h = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10);
  const [sStr, msStr = "0"] = parts[2]!.split(".");
  const s = parseInt(sStr!, 10);
  const ms = parseInt(msStr.padEnd(3, "0").slice(0, 3), 10);
  const baseMs = (h * 3600 + m * 60 + s) * 1000 + ms;
  const totalMs = baseMs + Math.round(t_rel_s * 1000);
  const H = String(Math.floor(totalMs / 3_600_000) % 24).padStart(2, "0");
  const M = String(Math.floor(totalMs / 60_000) % 60).padStart(2, "0");
  const S = String(Math.floor(totalMs / 1000) % 60).padStart(2, "0");
  const Ms = String(totalMs % 1000).padStart(3, "0");
  return `${date}T${H}:${M}:${S}.${Ms}Z`;
}
const COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#c084fc", "#fb7185", "#22d3ee", "#fb923c"];
export type View = "table" | "graph" | "histogram" | "scatter" | "map";
const LABELS: Record<View, string> = {
  get table() {
    return i18n.t("metrics.e86755d376aa");
  },
  get graph() {
    return i18n.t("metrics.a7947fb8c07b");
  },
  get histogram() {
    return i18n.t("metrics.86eb05ab111d");
  },
  get scatter() {
    return i18n.t("metrics.388e3e33d196");
  },
  get map() {
    return i18n.t("metrics.8ae525330384");
  },
};
const fmt = (v: unknown) =>
  v === null || v === undefined
    ? "—"
    : typeof v === "number"
      ? v.toLocaleString(i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB", {
          maximumFractionDigits: 3,
        })
      : String(v);
function Plot({ option, label }: { option: EChartsOption; label: string }) {
  useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const latest = useRef(option);
  latest.current = option;
  const [error, setError] = useState<string>();
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    void import("echarts")
      .then((e) => {
        if (disposed || !host.current) return;
        chart.current = e.init(host.current);
        chart.current.setOption(latest.current);
        observer = new ResizeObserver(() => chart.current?.resize());
        observer.observe(host.current);
      })
      .catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      observer?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);
  return error ? (
    <p role="alert">{error}</p>
  ) : (
    <div
      ref={host}
      style={{ height: 420 }}
      role="img"
      aria-label={label}
      data-testid="metrics-v3-plot"
    />
  );
}
function MetricMap({ data }: { data: MetricAnalysis }) {
  const { t: translate } = useTranslation();
  const [map, setMap] = useState<MlMap | null>(null);
  const features = useMemo(
    () =>
      data.map_points.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: { tooltip: p.tooltip, code: p.code },
      })),
    [data],
  );
  useEffect(() => {
    if (!map) return;
    const geo = { type: "FeatureCollection" as const, features };
    const source = map.getSource("metrics-v3") as GeoJSONSource | undefined;
    if (source) source.setData(geo);
    else {
      map.addSource("metrics-v3", { type: "geojson", data: geo });
      map.addLayer({
        id: "metrics-v3",
        type: "circle",
        source: "metrics-v3",
        paint: {
          "circle-radius": 5,
          "circle-color": "#60a5fa",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
    }
  }, [map, features]);
  useEffect(() => {
    if (!map) return;
    let popup: import("maplibre-gl").Popup | undefined;
    let disposed = false;
    const click = async (e: import("maplibre-gl").MapLayerMouseEvent) => {
      const { Popup } = await import("maplibre-gl");
      if (disposed) return;
      const node = document.createElement("div");
      node.textContent = String(e.features?.[0]?.properties?.["tooltip"] ?? "");
      popup?.remove();
      popup = new Popup().setLngLat(e.lngLat).setDOMContent(node).addTo(map);
    };
    map.on("click", "metrics-v3", click);
    return () => {
      disposed = true;
      map.off("click", "metrics-v3", click);
      popup?.remove();
    };
  }, [map]);
  const first = data.map_points[0];
  return (
    <KpiMapOSM
      key={data.capture_id}
      {...(first ? { center: [first.lng, first.lat] as [number, number] } : {})}
      zoom={first ? 13 : 5}
      showOperatorLegend={false}
      contextLabel={translate("metrics.b7ef3d32472c")}
      onMapReady={setMap}
      measurementStatus={first ? null : translate("metrics.59d5ea1eb6a5")}
    />
  );
}
export function MetricsWorkspace({
  projectId,
  captureId,
  onCaptureChange,
  selections,
  catalog,
  filters,
  onClear,
  onRemove,
  view: externalView,
  onViewChange,
  onTablePaneChange,
  workspaceId = "default",
  onColumnsChange,
  paneRequest = 0,
  cardViewRequest,
}: {
  projectId: string;
  captureId: string | undefined;
  onCaptureChange: (c: string) => void;
  selections: string[];
  catalog: MetricInfo[];
  filters: KpiQueryFilters;
  onClear: () => void;
  onRemove?: ((code: string) => void) | undefined;
  view?: View | undefined;
  onViewChange?: ((v: View) => void) | undefined;
  onTablePaneChange?: ((table: boolean) => void) | undefined;
  workspaceId?: string | undefined;
  onColumnsChange?: ((cols: { code: string; label: string }[]) => void) | undefined;
  paneRequest?: number | undefined;
  cardViewRequest?: { code: string; view: MetricView; n: number } | undefined;
}) {
  const { t: translate } = useTranslation();
  const [ts, updateTs] = useTableSettings(workspaceId);
  const [internalView, setInternalView] = useState<View>("table");
  const view = externalView ?? internalView;
  const setView = (v: View) => {
    setInternalView(v);
    onViewChange?.(v);
  };
  const [groupBy, setGroupBy] = useState("operator");
  const [x, setX] = useState("");
  const [search, setSearch] = useState("");
  const captureQuery = useQuery({
    queryKey: ["metric-captures", projectId, filters],
    queryFn: ({ signal }) => getMetricCaptures(projectId, filters, signal),
  });
  const query = useQuery({
    queryKey: [
      "metrics-v3",
      projectId,
      captureId,
      selections,
      filters,
      groupBy,
      view === "map",
      view === "scatter" ? x : "",
    ],
    queryFn: ({ signal }) =>
      getMetricAnalysis(
        projectId,
        captureId!,
        selections,
        filters,
        {
          group_by: groupBy,
          include_map: view === "map",
          ...(view === "scatter" && x ? { x } : {}),
        },
        signal,
      ),
    enabled: !!captureId && selections.length > 0,
    staleTime: 60_000,
  });
  const data = query.data;
  const option = useMemo<EChartsOption>(() => {
    if (!data) return {};
    const base: EChartsOption = {
      color: COLORS,
      animation: false,
      textStyle: { color: "#94a3b8" },
      tooltip: { trigger: "axis", confine: true, renderMode: "richText" },
      legend: { type: "scroll", top: 0, textStyle: { color: "#94a3b8" } },
      grid: { left: 70, right: 95, top: 55, bottom: 70 },
    };
    if (view === "histogram") {
      const hasDistribution = data.histogram.some(
        (h) =>
          h.distribution.length && data.columns.find((c) => c.code === h.code)?.kind !== "event",
      );
      if (hasDistribution) {
        const rows = data.histogram.flatMap((h) =>
          h.distribution.map((d) => ({
            label: `${h.operator ?? translate("metrics.51d3aaf58c26")} · ${h.label} · ${d.value}`,
            n: d.n,
          })),
        );
        return {
          ...base,
          xAxis: {
            type: "category",
            data: rows.map((r) => r.label),
            axisLabel: { rotate: 25, fontSize: 10 },
          },
          yAxis: { type: "value", name: "Occurrences" },
          series: [{ type: "bar", data: rows.map((r) => r.n) }],
        };
      }
      const units = [
        ...new Set(
          data.columns
            .filter((c) => c.kind !== "categorical")
            .map((c) => (c.kind === "event" ? translate("metrics.4e1802024d49") : c.unit)),
        ),
      ];
      return {
        ...base,
        xAxis: {
          type: "category",
          data: data.histogram.map(
            (h) =>
              `${h.operator ?? translate("metrics.51d3aaf58c26")}${h.band ? " · " + h.band : ""} · ${h.label}`,
          ),
          axisLabel: { rotate: 20, fontSize: 10 },
        },
        yAxis: units.map((unit, i) => ({
          type: "value" as const,
          name: unit,
          position: i === 0 ? ("left" as const) : ("right" as const),
          offset: i > 1 ? (i - 1) * 48 : 0,
        })),
        series: data.columns
          .filter((c) => c.kind !== "categorical")
          .flatMap((c) =>
            (c.kind === "event" ? ["per_connected_hour"] : ["p10", "p50", "p90"]).map((k) => ({
              type: "bar" as const,
              name: `${c.label} ${k}`,
              yAxisIndex: units.indexOf(
                c.kind === "event" ? translate("metrics.4e1802024d49") : c.unit,
              ),
              data: data.histogram.map((h) =>
                h.code === c.code ? h[k as "p10" | "p50" | "p90" | "per_connected_hour"] : null,
              ),
            })),
          ),
      };
    }

    if (view === "scatter")
      return {
        ...base,
        tooltip: { trigger: "item", confine: true },
        xAxis: { type: "value", name: x, scale: true },
        yAxis: { type: "value", scale: true },
        series: data.columns.map((c) => ({
          type: "scatter" as const,
          name: c.label,
          data: data.scatter.filter((p) => p.code === c.code).map((p) => [p.x, p.value, p.seq_gap]),
          symbolSize: 5,
        })),
      };
    const numeric = data.series.filter((s) => s.kind === "numeric");
    const units = [...new Set(numeric.map((s) => s.unit))];
    const cats = data.series.filter((s) => s.kind === "categorical");
    const events = data.series.filter((s) => s.kind === "event");
    const yAxes: NonNullable<EChartsOption["yAxis"]> = units.length
      ? units.map((u, i) => ({
          type: "value" as const,
          name: u,
          scale: true,
          position: i === 0 ? ("left" as const) : ("right" as const),
          offset: i > 1 ? (i - 1) * 48 : 0,
          splitLine: { show: i === 0 },
        }))
      : [{ type: "value", name: translate("metrics.81c7cdb0866e") }];
    const lines = numeric.map((s, i) => ({
      name: s.label,
      type: "line" as const,
      yAxisIndex: units.indexOf(s.unit),
      showSymbol: false,
      connectNulls: false,
      lineStyle: {
        width: 1.5,
        type: s.cell !== "all" && s.cell !== "0" ? ("dashed" as const) : ("solid" as const),
      },
      data: s.points.map((p) => [p.t_rel_s, p.value]),
      ...(i === 0
        ? {
            markLine: {
              symbol: "none",
              silent: false,
              data: events.flatMap((e) =>
                e.points.map((p) => ({
                  xAxis: p.t_rel_s,
                  name: e.label,
                  label: { formatter: e.label, fontSize: 9 },
                  tooltip: { formatter: () => p.tooltip },
                })),
              ),
            },
          }
        : {}),
    }));
    const eventSeries = events.map((s) => ({
      name: s.label,
      type: "scatter" as const,
      symbol: "diamond",
      symbolSize: 7,
      data: s.points.map((p) => [p.t_rel_s, p.value]),
    }));
    const categorical = cats.map((s) => ({
      name: s.label,
      type: "scatter" as const,
      xAxisIndex: 1,
      yAxisIndex: units.length || 1,
      symbol: "rect",
      symbolSize: [7, 14],
      data: s.points.map((p) => [p.t_rel_s, String(p.value)]),
    }));
    if (cats.length)
      (yAxes as object[]).push({
        type: "category",
        gridIndex: 1,
        data: [...new Set(cats.flatMap((s) => s.states))],
        axisLabel: { fontSize: 9 },
      });
    return {
      ...base,
      grid: cats.length
        ? [
            { left: 70, right: 100, top: 55, bottom: 155 },
            { left: 70, right: 100, height: 65, bottom: 65 },
          ]
        : base.grid,
      xAxis: cats.length
        ? [
            { type: "value", min: 0, name: translate("metrics.46c537ebda08") },
            { type: "value", min: 0, gridIndex: 1 },
          ]
        : { type: "value", min: 0, name: translate("metrics.46c537ebda08") },
      yAxis: yAxes,
      dataZoom: [
        { type: "inside", xAxisIndex: cats.length ? [0, 1] : [0] },
        { type: "slider", xAxisIndex: cats.length ? [0, 1] : [0], bottom: 10 },
      ],
      series: [...lines, ...(!numeric.length ? eventSeries : []), ...categorical],
    };
  }, [translate, data, view, x]);
  const exportCsv = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([data.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `metrics-${data.capture_id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  // 1.81.0 — Spec Premium Adaptive Metrics Table Phase 1 :
  // - Supprimé : titre "Metrics - cells and events", sous-titre Light/Deep,
  //   Capture select, View select, Reset btn, Export CSV dupliqué, Search time.
  //   Services backend conservés (captureQuery, data, exportCsv restent côté
  //   JS). Si plusieurs captures : sélecteur discret dans toolbar via menu
  //   Columns (Phase 2+). Pour l'instant, prend la 1re capture dispo si
  //   captureId null.
  useEffect(() => {
    if (!captureId && captureQuery.data?.[0]) {
      onCaptureChange(captureQuery.data[0].capture_id);
    }
  }, [captureId, captureQuery.data, onCaptureChange]);
  const captureLabel = captureQuery.data?.find((c) => c.capture_id === captureId)?.label;
  const captureDate = extractCaptureDate(captureLabel);
  const originTs = data?.origin_ts ?? null;

  // 1.82.0 — BC3_METRICS_NATIVE_CHARTS_V2 Phase 1 + V3 corrections
  type MetricPane = "charts" | "table" | "overlay";
  // V3 §8 : pagination Table 25/50/100 (défaut 25)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [page, setPage] = useState(1);
  const [pane, setPaneRaw] = useState<MetricPane>(() => {
    try {
      const stored = localStorage.getItem("bc3.metrics.pane");
      if (stored === "charts" || stored === "table" || stored === "overlay") return stored;
    } catch {
      /* ignore */
    }
    return "charts";
  });
  const setPane = (p: MetricPane) => {
    setPaneRaw(p);
    try {
      localStorage.setItem("bc3.metrics.pane", p);
    } catch {
      /* ignore */
    }
    // Projection sur l'ancien `view` interne : table→table, overlay→graph.
    // charts n'utilise pas /metrics/table en SSR, les cards gèrent leur propre série.
    if (p === "table") setView("table");
    else if (p === "overlay") setView("graph");
  };
  // 1.88.0 — vue par carte dans le volet Charts (défaut graph, l'utilisateur
  // peut basculer une carte sur histogram/table/map sans toucher les autres).
  const [cardViews, setCardViews] = useState<Record<string, MetricView>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`bc4.metrics.views.${workspaceId}`) ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(`bc4.metrics.views.${workspaceId}`, JSON.stringify(cardViews));
    } catch {
      /* Memory-only if storage is unavailable. */
    }
  }, [cardViews, workspaceId]);
  // Catalogue ⋮ → visualisation applies to that metric's own card.
  useEffect(() => {
    if (!cardViewRequest) return;
    const { code, view } = cardViewRequest;
    setCardViews((m) => (m[code] === view ? m : { ...m, [code]: view }));
  }, [cardViewRequest]);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    onTablePaneChange?.(pane === "table");
  }, [pane, onTablePaneChange]);
  const lastPaneRequest = useRef(paneRequest);
  useEffect(() => {
    if (lastPaneRequest.current === paneRequest) return;
    lastPaneRequest.current = paneRequest;
    setPaneRaw("table");
    setView("table");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneRequest]);
  const previousExternalView = useRef(externalView);
  useEffect(() => {
    if (previousExternalView.current === externalView) return;
    previousExternalView.current = externalView;
    if (externalView) setPaneRaw(externalView === "table" ? "table" : "overlay");
  }, [externalView]);
  // Décoder chaque selection "code@cell" en { code, cell }
  const parsedSelections = useMemo(
    () =>
      selections.map((s) => {
        const [code, cell = "all"] = s.split("@");
        return { full: s, code: code ?? "", cell };
      }),
    [selections],
  );
  const metricInfoByCode = useMemo(() => {
    const m = new Map<string, MetricInfo>();
    for (const info of catalog) m.set(info.code, info);
    return m;
  }, [catalog]);
  const columnKey = (data?.columns ?? []).map((c) => c.code).join("|");
  useEffect(() => {
    onColumnsChange?.((data?.columns ?? []).map((c) => ({ code: c.code, label: c.label })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnKey]);
  const visibleCols = data ? orderedColumns(data.columns, ts) : [];
  const shownRows = data
    ? arrangeRows(
        data.rows,
        ts,
        ts.search.trim()
          ? (r) =>
              visibleCols.some(
                (c) => r.values[c.code] != null && fmt(r.values[c.code]).includes(ts.search.trim()),
              )
          : undefined,
      )
    : [];
  const tableStyle = {
    "--t-bg": ts.colors.background,
    "--t-head-bg": ts.colors.headerBg,
    "--t-head-fg": ts.colors.headerText,
    "--t-row": ts.colors.rowBg,
    "--t-alt": ts.zebra ? ts.colors.altRow : ts.colors.rowBg,
    "--t-border": ts.colors.border,
    "--t-sel": ts.colors.selected,
    "--t-fg": textFor(ts.colors.rowBg),
    "--t-font": { small: "11px", medium: "12px", large: "14px" }[ts.fontSize],
    "--t-row-h": { compact: "22px", normal: "28px", comfortable: "36px" }[ts.rowHeight],
    "--t-head-h": { compact: "26px", normal: "34px", large: "44px" }[ts.headerHeight],
    "--t-pad": { small: "2px 6px", medium: "4px 10px", large: "8px 14px" }[ts.cellPadding],
    "--t-gap": { compact: "0px", normal: "6px", wide: "14px" }[ts.spacing],
    "--t-radius": ts.radius === "rounded" ? "8px" : "0px",
    "--t-align": ts.cellAlign,
    "--t-num-align": ts.numberAlign,
    height:
      ts.height === "fixed" ? "480px" : ts.height === "custom" ? `${ts.customHeight}px` : undefined,
    resize: ts.resizable ? "vertical" : undefined,
  } as CSSProperties;
  const tableTitle = parsedSelections
    .map((selection) => {
      const info = metricInfoByCode.get(selection.full) ?? metricInfoByCode.get(selection.code);
      const column = data?.columns.find(
        (c) => c.code === selection.full || c.code === selection.code,
      );
      const label = info?.label ?? column?.label ?? selection.code;
      const cellLabel = info?.cell_options?.find((c) => c.cell === selection.cell)?.label;
      return cellLabel ? `${label} · ${cellLabel}` : label;
    })
    .join(" · ");
  return (
    <div className="kpi-unified-contents" data-testid="metrics-v3-workspace" data-pane={pane}>
      {!captureId && (
        <div className="kpi-graph-card col-span-full kpi-chart-state">
          {translate("metrics.568f4197970b")}
        </div>
      )}
      {captureId && (
        <section
          className="kpi-metrics-charts-grid kpi-unified-contents"
          data-count={Math.min(parsedSelections.length, 8)}
          data-testid="metrics-charts-grid"
        >
          {parsedSelections.map((s, i) => {
            const info = metricInfoByCode.get(s.code);
            const cellLabel = info?.cell_options?.find((c) => c.cell === s.cell)?.label ?? s.cell;
            const title = info ? `${info.label} · ${cellLabel}` : s.full;
            return (
              <PanelShell
                key={s.full}
                workspaceId={workspaceId}
                id={`metric:${s.full}`}
                natural={100 + i}
                defaultTitle={title}
              >
                {(panelTitle) => (
                  <MetricGraphCard
                    projectId={projectId}
                    code={s.full}
                    label={`${i + 1}. ${panelTitle}`}
                    unit={info?.unit ?? ""}
                    tech={info?.tech ?? ""}
                    category={info?.category_label ?? null}
                    eventCode={info?.event_code ?? s.code}
                    appliedFilters={filters}
                    onRemove={() => {
                      if (onRemove) onRemove(s.full);
                      else if (selections.length === 1) onClear();
                    }}
                    view={cardViews[s.full] ?? "graph"}
                    onViewChange={(v) =>
                      setCardViews((m) => {
                        if (m[s.full] === v) return m;
                        return { ...m, [s.full]: v };
                      })
                    }
                  />
                )}
              </PanelShell>
            );
          })}
        </section>
      )}
      {pane !== "charts" && (
        <PanelShell
          workspaceId={workspaceId}
          id="metrics:pane"
          natural={200}
          defaultTitle={tableTitle}
        >
          {(panelTitle) => (
            <article
              ref={panelRef}
              className="kpi-graph-card col-span-full kpi-metrics-table-premium"
              data-pane={pane}
            >
              <header className="kpi-metrics-table-toolbar">
                <h3 className="kpi-metrics-table-title" title={panelTitle}>
                  {panelTitle}
                </h3>
                <WorkspacePanelMenu label={translate("panel.actions")}>
                  <DropdownMenuItem disabled={!data} onSelect={exportCsv}>
                    <Download size={14} /> {translate("panel.export_csv")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void panelRef.current?.requestFullscreen?.()}>
                    <Maximize2 size={14} /> {translate("panel.fullscreen")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setPane("charts")}>
                    <X size={14} /> {translate("panel.remove")}
                  </DropdownMenuItem>
                </WorkspacePanelMenu>
              </header>
              {!captureId ? (
                <div className="kpi-chart-state">{translate("metrics.568f4197970b")}</div>
              ) : query.isPending ? (
                <div className="kpi-chart-state" role="status">
                  {" "}
                  {translate("metrics.eb724a908f1f")}{" "}
                </div>
              ) : query.isError ? (
                <div className="kpi-chart-state" role="alert">
                  {query.error.message}
                </div>
              ) : (
                data && (
                  <>
                    {/* 1.80.0 — bandeau explicite quand colonnes > 0 et rows = 0 :
                la réponse back est valide (200 Zod) mais vide. On remonte
                la raison si fournie par le back (connected_reason) sinon
                un fallback générique traçable. Jamais vide muet. */}
                    {data.columns.length > 0 && data.rows.length === 0 && (
                      <div
                        role="alert"
                        className="m-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                        data-testid="metrics-empty-banner"
                      >
                        <strong>Aucune donnée pour cette sélection.</strong>{" "}
                        {data.connected_reason
                          ? `Raison : ${data.connected_reason}.`
                          : "La capture est décodée mais la projection cell_second est vide pour ces métriques × cellule. Lancer bc4 project-cell-second --capture <id> ou --missing côté back."}
                        <br />
                        <span className="font-mono text-[10px] text-amber-700">
                          capture_id={data.capture_id} · result_id=
                          {String(data.result_id).slice(0, 8)}
                        </span>
                      </div>
                    )}
                    {view === "table" ? (
                      <div
                        className="kpi-data-table kpi-metrics-table-body kpi-ts"
                        style={tableStyle}
                        data-style={ts.style}
                        data-borders={ts.borders}
                        data-sticky-head={ts.stickyHeader}
                        data-sticky-first={ts.stickyFirstColumn}
                        data-wrap={ts.wrap}
                        data-hscroll={ts.hScroll}
                        data-testid="metrics-table-styled"
                      >
                        <label className="kpi-ts-search">
                          <Search size={12} />
                          <input
                            value={ts.search}
                            onChange={(e) => {
                              updateTs({ search: e.target.value });
                              setPage(1);
                            }}
                            placeholder={translate("wss.searchData")}
                            aria-label={translate("wss.searchData")}
                          />
                        </label>
                        <div className="kpi-table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th className="col-time">
                                  Time (UTC)
                                  <small className="block">yyyy-mm-ddThh:mm:ss.sssZ</small>
                                </th>
                                <th className="col-geo numeric">
                                  Latitude
                                  <small className="block">°</small>
                                </th>
                                <th className="col-geo numeric">
                                  Longitude
                                  <small className="block">°</small>
                                </th>
                                {visibleCols.map((c) => (
                                  <th key={c.code} title={c.code} className="numeric">
                                    {c.label}
                                    {ts.showUnits && (
                                      <small className="block">{c.unit || "—"}</small>
                                    )}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {shownRows.slice((page - 1) * pageSize, page * pageSize).map((r) => (
                                <tr key={r.second} data-second={r.second}>
                                  <td
                                    className="col-time font-mono text-[11px]"
                                    title={`seq ${r.seq_first}–${r.seq_last} · t_rel ${r.t_rel_s}s`}
                                  >
                                    {formatUtc(captureDate, r.t_rel_s, originTs)}
                                  </td>
                                  {/* Phase 2 : join /signaling/points pour peupler lat/lng.
                              Pour l'instant, "—" explicite (pas de 0 fabriqué). */}
                                  <td className="col-geo numeric text-muted-foreground">—</td>
                                  <td className="col-geo numeric text-muted-foreground">—</td>
                                  {visibleCols.map((c) => (
                                    <td
                                      className="numeric"
                                      key={c.code}
                                      title={`n = ${r.counts[c.code] ?? "—"}`}
                                    >
                                      {c.kind === "event"
                                        ? r.values[c.code] === 1
                                          ? "1"
                                          : ""
                                        : r.values[c.code] == null
                                          ? "—"
                                          : fmt(r.values[c.code])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* V3 §8 : pagination 25/50/100 + "Showing X-Y of N rows" */}
                        <div className="kpi-metrics-table-pager" data-testid="metrics-table-pager">
                          <label>
                            Rows per page
                            <select
                              value={pageSize}
                              onChange={(e) => {
                                setPageSize(Number(e.target.value) as 25 | 50 | 100);
                                setPage(1);
                              }}
                            >
                              <option value={25}>25</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select>
                          </label>
                          <span>
                            Showing {Math.min((page - 1) * pageSize + 1, shownRows.length)}–
                            {Math.min(page * pageSize, shownRows.length)} of {shownRows.length} rows
                          </span>
                          <span className="pager-nav">
                            <button
                              className="kpi-button"
                              disabled={page <= 1}
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                              Prev
                            </button>
                            <button
                              className="kpi-button"
                              disabled={page * pageSize >= shownRows.length}
                              onClick={() => setPage((p) => p + 1)}
                            >
                              Next
                            </button>
                          </span>
                        </div>
                      </div>
                    ) : view === "map" ? (
                      <MetricMap data={data} />
                    ) : (
                      <Plot
                        option={option}
                        label={translate("metrics.cefbbf406bba", { v0: LABELS[view] })}
                      />
                    )}
                    {view === "histogram" && data.columns.some((c) => c.kind === "event") && (
                      <div className="p-3 text-xs">
                        <p>
                          {" "}
                          {translate("metrics.91b5e7f9e272")} {fmt(data.connected_seconds)} s{" "}
                          {data.connected_reason}
                        </p>
                        {data.pair_rates.map((p) => (
                          <p key={p.type}>
                            {p.type} : {p.success}/{p.known_outcomes}{" "}
                            {translate("metrics.8df97de2b567")} {fmt(p.success_pct)} % ·{" "}
                            {p.attempts} {translate("metrics.5ed4837057bd")}{" "}
                          </p>
                        ))}
                      </div>
                    )}
                    {/* 1.83.1 — Panel "Information · #UUID" supprimé partout (Charts,
                Table, Overlay). Les métadonnées (result_id, aggregation,
                time_policy, pairing, decoder_version, decode_level, gaps)
                restent accessibles côté API /metrics/table response et
                via le tooltip title du row (`seq N–M · t_rel Xs`). */}
                  </>
                )
              )}
            </article>
          )}
        </PanelShell>
      )}
    </div>
  );
}
