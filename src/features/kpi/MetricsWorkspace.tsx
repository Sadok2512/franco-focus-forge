import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ECharts, EChartsOption } from "echarts";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { getMetricAnalysis, getMetricCaptures } from "@/lib/api/client";
import type { MetricAnalysis, MetricInfo } from "@/lib/api/metrics-schemas";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { KpiMapOSM } from "./KpiMapOSM";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BarChart3, ChartNoAxesCombined, ChevronDown, Download, Info, MapPin, MoreVertical, Table2, X } from "lucide-react";
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
const VIEW_ICONS = { table: Table2, graph: ChartNoAxesCombined, histogram: BarChart3, scatter: ChartNoAxesCombined, map: MapPin };
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
      className="kpi-plot h-[235px]"
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
  view: externalView,
  onViewChange,
}: {
  projectId: string;
  captureId: string | undefined;
  onCaptureChange: (c: string) => void;
  selections: string[];
  catalog: MetricInfo[];
  filters: KpiQueryFilters;
  onClear: () => void;
  view?: View | undefined;
  onViewChange?: ((v: View) => void) | undefined;
}) {
  const { t: translate } = useTranslation();
  const [internalView, setInternalView] = useState<View>("table");
  const view = externalView ?? internalView;
  const setView = (v: View) => {
    setInternalView(v);
    onViewChange?.(v);
  };
  const [groupBy, setGroupBy] = useState("operator");
  const [x, setX] = useState("");
  const [search, setSearch] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
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
          yAxis: { type: "value", name: translate("metrics.occurrences") },
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
  return (
    <article className="kpi-graph-card metrics-analysis-card col-span-full" data-testid="metrics-v3-workspace">
      <header className="kpi-card-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="kpi-order">{selections.length}</span>
            <h3 title={translate("metrics.ba86c69725e4")}>{translate("metrics.ba86c69725e4")}</h3>
          </div>
          <p>
            {data
              ? `${data.decode_level === "deep" ? "Deep" : "Light"} ${data.decoder_version}`
              : translate("metrics.8d75f000495f")}
          </p>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="kpi-icon" disabled={!data} aria-label={translate("metrics.showInfo")} title={translate("metrics.showInfo")} aria-expanded={infoOpen} onClick={() => setInfoOpen((open) => !open)}><Info /></Button>
          <Button variant="ghost" size="icon" className="kpi-icon" disabled={!data} aria-label={translate("metrics.b84f9613287b")} title={translate("metrics.b84f9613287b")} onClick={exportCsv}><Download /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="kpi-icon" aria-label={translate("metrics.actions")} title={translate("metrics.actions")}><MoreVertical /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(LABELS).map(([key, label]) => { const Icon = VIEW_ICONS[key as View]; return <DropdownMenuItem key={key} onSelect={() => setView(key as View)}><Icon size={14} />{label}</DropdownMenuItem>; })}
              <DropdownMenuItem onSelect={onClear}><X size={14} />{translate("metrics.5b35e0e35591")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="kpi-icon" onClick={onClear} title={translate("metrics.68144408eb29")} aria-label={translate("metrics.68144408eb29")}><X /></Button>
        </div>
      </header>
      <div className="kpi-card-meta metrics-card-controls">
        <label className="kpi-select-label min-w-0">
          {translate("metrics.captureLabel")}
          <select
            aria-label={translate("metrics.bd26d0b73036")}
            className="kpi-select"
            value={captureId ?? ""}
            onChange={(e) => onCaptureChange(e.target.value)}
          >
            <option value="">{translate("metrics.afe552c801ae")}</option>
            {captureId && !captureQuery.data?.some((c) => c.capture_id === captureId) && (
              <option value={captureId}>{captureId}</option>
            )}
            {captureQuery.data?.map((c) => (
              <option key={c.capture_id} value={c.capture_id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="kpi-button" aria-label={translate("metrics.015e85219fb0")}>
              {translate("metrics.af3aaf87ff99")} · {LABELS[view]}<ChevronDown size={13} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {Object.entries(LABELS).map(([key, label]) => { const Icon = VIEW_ICONS[key as View]; return <DropdownMenuItem key={key} onSelect={() => setView(key as View)}><Icon size={14} />{label}</DropdownMenuItem>; })}
          </DropdownMenuContent>
        </DropdownMenu>
        {view === "histogram" && (
          <label className="kpi-select-label">
            {" "}
            {translate("metrics.560b1e430bba")}{" "}
            <select
              className="kpi-select"
              aria-label={translate("metrics.b7a9555413fc")}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              <option value="none">{translate("metrics.population")}</option>
              <option value="operator">{translate("metrics.3ec1ead23ec6")}</option>
              <option value="band">{translate("metrics.a78d899fbf01")}</option>
              <option value="operator_band">{translate("metrics.d070df0886e1")}</option>
            </select>
          </label>
        )}
        {view === "scatter" && (
          <label className="kpi-select-label">
            X{" "}
            <select
              className="kpi-select"
              aria-label={translate("metrics.7c804dfaa372")}
              value={x}
              onChange={(e) => setX(e.target.value)}
            >
              <option value="">{translate("metrics.bec8087f7b17")}</option>
              {catalog
                .filter((m) => m.available && m.kind === "numeric" && !m.alias_of)
                .flatMap((m) =>
                  m.cell_scoped
                    ? m.cell_options
                        .filter((c) => c.available)
                        .map((c) => (
                          <option key={`${m.code}@${c.cell}`} value={`${m.code}@${c.cell}`}>
                            {m.label} · {c.label}
                          </option>
                        ))
                    : [
                        <option key={m.code} value={m.code}>
                          {m.label}
                        </option>,
                      ],
                )}
            </select>
          </label>
        )}
      </div>
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
            {view === "table" ? (
              <div className="metrics-observations">
                <input
                  className="m-2 border rounded px-2 bg-background text-xs"
                  placeholder={translate("metrics.59623fc4cc6e")}
                  aria-label={translate("metrics.5da2cea99150")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="kpi-table-scroll max-h-[235px]">
                  <table>
                    <thead>
                      <tr>
                        <th>{translate("metrics.46c537ebda08")}</th>
                        {data.columns.map((c) => (
                          <th key={c.code} title={c.code}>
                            {c.label}
                            <small className="block">{c.unit}</small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows
                        .filter((r) => !search || JSON.stringify(r).includes(search))
                        .map((r) => (
                          <tr key={r.second} data-second={r.second}>
                            <td title={`seq ${r.seq_first}–${r.seq_last}`}>
                              {fmt(r.t_rel_s)}
                              <small className="block text-muted-foreground">{r.time_label}</small>
                            </td>
                            {data.columns.map((c) => (
                              <td
                                className="numeric"
                                key={c.code}
                                title={`n = ${r.counts[c.code] ?? "—"}`}
                              >
                                {c.kind === "event"
                                  ? r.values[c.code] === 1
                                    ? "1"
                                    : ""
                                  : fmt(r.values[c.code])}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
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
                    {p.type} : {p.success}/{p.known_outcomes} {translate("metrics.8df97de2b567")}{" "}
                    {fmt(p.success_pct)} % · {p.attempts} {translate("metrics.5ed4837057bd")}{" "}
                  </p>
                ))}
              </div>
            )}
            <details open={infoOpen} onToggle={(event) => setInfoOpen(event.currentTarget.open)} className="p-2 border-t text-xs text-muted-foreground">
              <summary>
                {translate("metrics.23c32c5569dc")} {data.result_id}
              </summary>
              <p>{data.aggregation}</p>
              <p>{data.time_policy}</p>
              <p>{data.pairing}</p>
              <p>
                {" "}
                {translate("metrics.11d1fa9f3de9")} {data.decoder_version} · {data.decode_level}
              </p>
              {data.gaps.map((g) => (
                <p key={g}>{g}</p>
              ))}
            </details>
          </>
        )
      )}
    </article>
  );
}
