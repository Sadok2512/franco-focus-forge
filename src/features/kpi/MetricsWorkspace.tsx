import { Download, Maximize2, X } from "lucide-react";
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
import { MetricGraphCard } from "./MetricGraphCard";
import { pickGraphSelections, type MetricViews } from "./metric-views";
import { MetricsEventsRibbon } from "./MetricsEventsRibbon";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { WorkspacePanelMenu } from "./WorkspacePanelMenu";
import { PanelShell } from "./PanelShell";
import { downloadCsv } from "./workspace-model";
import {
  isClockAvailable,
  readTimeAxisMode,
  timeAxisLabel,
  writeTimeAxisMode,
  type TimeAxisMeta,
  type TimeAxisMode,
} from "./time-axis";

// 1.88.0 (lot Time/GPS) — plus de parsing côté front : le back expose
// `rows[].time_local` et `rows[].time_utc` directement (format HH:MM:SS.mmm)
// + `capture_date` (YYYY-MM-DD) au niveau top. Aucune date devinée depuis
// le nom de capture : si `capture_date` ou `time_*` est null, cellule
// grisée avec tooltip indiquant la raison (`reason` ou champ absent).
// 1.91.1 — tooltip localisé via i18n `metrics.reason.<code>`. Clés en défaut
// (lot BC1), traductions fr fournies. Fallback = code brut si clé manquante
// (ne cache jamais un reason inconnu).
function useReasonLabel() {
  const { t: translate } = useTranslation();
  return (reason: string | null | undefined): string | undefined => {
    if (!reason) return undefined;
    const key = `metrics.reason.${reason}`;
    const translated = translate(key);
    return translated === key ? reason : translated;
  };
}
function fmtLatLng(v: number | null | undefined): string {
  return v == null ? "" : v.toFixed(6);
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
  view: externalView,
  onViewChange,
  // 1.91.0 — props Lovable introduites 1.89→1.90 (⚙ Apply + per-card view).
  // Acceptées pour satisfaire le contrat KpiWorkspace mais no-op dans la
  // version BC3 (le per-card view + Apply draft ne sont pas portés —
  // conflits avec le Time/GPS lot). Si nécessaire plus tard, implémenter
  // le state cardViews + onRemove dans un lot dédié.
  onTablePaneChange,
  views: viewsProp,
  workspaceId: _workspaceId,
  onColumnsChange: _onColumnsChange,
  paneRequest,
  cardViewRequest,
  onRemove,
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
  onTablePaneChange?: ((open: boolean) => void) | undefined;
  views?: MetricViews | undefined;
  workspaceId?: string;
  onColumnsChange?: unknown;
  paneRequest?: number;
  cardViewRequest?: { code: string; view: string; n: number } | undefined;
  onRemove?: ((code: string) => void) | undefined;
}) {
  const { t: translate } = useTranslation();
  const reasonLabel = useReasonLabel();
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
    // Adding/removing a parameter keeps the current table on screen (veiled)
    // instead of blanking it; a capture or filter change never reuses old rows.
    placeholderData: (prev, prevQuery) =>
      prevQuery &&
      prevQuery.queryKey[2] === captureId &&
      JSON.stringify(prevQuery.queryKey[4]) === JSON.stringify(filters)
        ? prev
        : undefined,
  });
  const data = query.data;
  const refreshing = query.isPlaceholderData && query.isFetching;
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
  // 1.88.0 — date absolue vient uniquement du back (`data.capture_date`).
  // Plus de regex sur le nom de capture.
  const captureDate = data?.capture_date ?? null;
  // 1.92.0 — kind back 0.76.1 pour badge "Scanner" + désactivation UE metrics
  // sur captures scanner. Jamais caché (visibilité utilisateur requise).
  const captureKind = captureQuery.data?.find((c) => c.capture_id === captureId)?.kind ?? null;
  const isScannerCapture = captureKind === "scanner";
  // 1.99.1 (lot C axe X temps) — mode d'affichage sélectionné + meta temporelle
  // partagée. La meta vient de /metrics/analysis (data) car /metrics/series
  // n'est pas query ici (fait par chaque MetricGraphCard séparément) mais
  // identique au back pour la même capture (join nmf_capture + nmf_file).
  const [timeAxisMode, setTimeAxisModeRaw] = useState<TimeAxisMode>(() => readTimeAxisMode());
  const timeMeta: TimeAxisMeta | undefined = data
    ? {
        nmf_start_at: data.nmf_start_at ?? null,
        origin_ts: data.origin_ts,
        utc_offset_min: data.utc_offset_min ?? null,
        capture_date: data.capture_date ?? null,
      }
    : undefined;
  const clockOk = isClockAvailable(timeMeta);
  // Repli automatique si l'utilisateur a préféré Clock mais la capture n'a
  // pas de meta #START/#UT (null). Jamais une heure inventée.
  const effectiveTimeAxisMode: TimeAxisMode = clockOk ? timeAxisMode : "capture";
  const setTimeAxisMode = (m: TimeAxisMode) => {
    setTimeAxisModeRaw(m);
    writeTimeAxisMode(m);
  };

  // 1.82.0 — BC3_METRICS_NATIVE_CHARTS_V2 Phase 1 + V3 corrections
  type MetricPane = "charts" | "table" | "overlay";
  // V3 §8 : pagination Table 25/50/100 (défaut 25)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [page, setPage] = useState(1);
  // 1.102.0 — le menu ⋮ du tableau des mesures (export, plein écran, fermeture).
  const tablePanelRef = useRef<HTMLDivElement>(null);
  const [pane, setPaneRaw] = useState<MetricPane>(() => {
    try {
      const stored = localStorage.getItem((_workspaceId ? `bc3.metrics.pane.${_workspaceId}` : "bc3.metrics.pane"));
      if (stored === "charts" || stored === "table" || stored === "overlay") return stored;
    } catch {
      /* ignore */
    }
    return "charts";
  });
  const setPane = (p: MetricPane) => {
    setPaneRaw(p);
    try {
      localStorage.setItem((_workspaceId ? `bc3.metrics.pane.${_workspaceId}` : "bc3.metrics.pane"), p);
    } catch {
      /* ignore */
    }
    // Projection sur l'ancien `view` interne : table→table, overlay→graph.
    // charts n'utilise pas /metrics/table en SSR, les cards gèrent leur propre série.
    if (p === "table") setView("table");
    else if (p === "overlay") setView("graph");
    // Le parent a besoin du mode pour dimensionner la grille et savoir que le
    // tableau est ouvert (compteur de panneaux, disposition table-only).
    onTablePaneChange?.(p === "table");
  };
  // 1.94.0 — la barre [View ▾ | Per row ▾ | Export CSV | Fullscreen] est
  // supprimée. Le mode du panneau vient des demandes du catalogue Metrics :
  // ⋮ → Tableau ouvre le grand tableau, ⋮ → Graphique/Histogramme/Carte y
  // ramène. Rien d'autre ne change le mode.
  useEffect(() => {
    if (paneRequest) setPane("table");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneRequest]);
  // 1.102.1 — ajouter un graphe ne ferme plus le tableau des mesures : les
  // cartes graphiques s'affichent à côté, seul « Fermer le panneau » le retire.
  // 1.101.0 — le mode mémorisé à l'ouverture de l'onglet est signalé au parent
  // (le compteur de panneaux de KpiWorkspace part du tableau des mesures).
  useEffect(() => {
    onTablePaneChange?.(pane === "table");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // 1.101.0 — une métrique demandée en « Tableau » dans le catalogue ⋮ n'a pas
  // de carte graphique : elle n'existe que dans le grand tableau des mesures.
  const graphSelections = useMemo(
    () => pickGraphSelections(parsedSelections, viewsProp ?? {}),
    [parsedSelections, viewsProp],
  );
  return (
    <article
      className="kpi-metrics-table-premium kpi-unified-contents"
      data-testid="metrics-v3-workspace"
    >
      {/* 1.99.1 (lot C axe X temps) — Switcher Clock (local) / Clock (UTC) /
          Capture time (s). Mémorisé en localStorage (try/catch dans time-axis.ts).
          Capture sans #START/#UT (meta null) : désactivé + tooltip + repli auto
          sur Capture time (jamais une heure inventée). */}
      {captureId && parsedSelections.length > 0 && (
        <div
          className="kpi-metrics-time-axis-switch"
          role="radiogroup"
          aria-label="Time axis mode"
          data-testid="metrics-time-axis-switch"
        >
          <small className="text-muted-foreground">
            Axis: <strong>{timeAxisLabel(effectiveTimeAxisMode, timeMeta)}</strong>
          </small>
          <div className="kpi-metrics-time-axis-options">
            {(
              [
                { v: "clock-local", label: "Clock (local)" },
                { v: "clock-utc", label: "Clock (UTC)" },
                { v: "capture", label: "Capture time (s)" },
              ] as { v: TimeAxisMode; label: string }[]
            ).map(({ v, label }) => {
              const disabled = (v === "clock-local" || v === "clock-utc") && !clockOk;
              const title = disabled
                ? "Clock unavailable: capture header missing #START or #UT"
                : label;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={effectiveTimeAxisMode === v}
                  disabled={disabled}
                  title={title}
                  className={`kpi-button ${effectiveTimeAxisMode === v ? "primary" : ""}`}
                  onClick={() => setTimeAxisMode(v)}
                  data-testid={`metrics-time-axis-${v}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {captureId && parsedSelections.length > 0 && (
        <MetricsEventsRibbon
          projectId={projectId}
          captureId={captureId}
          filters={filters}
          syncId={`metrics-charts-${captureId}`}
          timeAxisMode={effectiveTimeAxisMode}
          timeMeta={timeMeta}
        />
      )}
      {captureId && parsedSelections.length === 0 && (
        <p className="kpi-chart-state" data-testid="metrics-no-selection">
          {translate("metrics.pickFromCatalogue")}
        </p>
      )}
      {captureId && graphSelections.length > 0 && (
        <section
          className="kpi-metrics-charts-grid"
          data-testid="metrics-charts-grid"
        >
          {graphSelections.map((s, i) => {
            const info = metricInfoByCode.get(s.code);
            const cellLabel = info?.cell_options?.find((c) => c.cell === s.cell)?.label ?? s.cell;
            const title = info ? `${info.label} · ${cellLabel}` : s.full;
            return (
              <PanelShell
                key={s.full}
                workspaceId={_workspaceId ?? "metrics"}
                id={`metric:${s.full}`}
                natural={100 + i}
                defaultTitle={`${i + 1}. ${title}`}
              >
                {(panelTitle) => <MetricGraphCard
                projectId={projectId}
                code={s.full}
                label={panelTitle}
                unit={info?.unit ?? ""}
                tech={info?.tech ?? ""}
                category={info?.category_label ?? null}
                eventCode={info?.event_code ?? s.code}
                appliedFilters={filters}
                onRemove={() => {
                  const next = selections.filter((x) => x !== s.full);
                  if (!next.length) onClear();
                  else onRemove?.(s.full);
                }}
                view="graph"
                onViewChange={() => {
                  /* Mode exclusif Charts : la vue est verrouillée sur graph */
                }}
                syncId={captureId ? `metrics-charts-${captureId}` : undefined}
                timeAxisMode={effectiveTimeAxisMode}
              />}
              </PanelShell>
            );
          })}
        </section>
      )}
      {captureId && parsedSelections.length > 0 && graphSelections.length === 0 && (
        <p className="kpi-chart-state" data-testid="metrics-table-only-state">
          {translate("metrics.tableOnlyHint")}{" "}
          <button
            type="button"
            className="kpi-button"
            data-testid="metrics-show-table"
            onClick={() => setPane("table")}
          >
            {translate("metrics.showTable")}
          </button>
        </p>
      )}
      {isScannerCapture && (
        <div
          role="alert"
          className="m-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          data-testid="metrics-scanner-banner"
        >
          <strong>Scanner capture</strong> · UE cell metrics (RSRP, CA, throughput par couche)
          not available in scanner mode — captures Ibflex-Scanner exposent uniquement les events
          <code> SCANCONFIG / STARTSCAN / CELLSCAN / OFDMSCAN</code>. Les cellules UE du catalogue
          sont désactivées (jamais cachées). Un lot "Scanner view" dédié est ouvert pour exposer
          RSRP/RSRQ par PCI scanné + OFDM power — voir CHANGELOG back 0.76.1.
        </div>
      )}
      {!captureId ? (
        <div className="kpi-chart-state">{translate("metrics.568f4197970b")}</div>
      ) : pane !== "table" ? null : query.isPending ? (
        <div className="kpi-measurements-loading" aria-busy="true">
          <h3>{translate("metrics.tablePanel")}</h3>
          <div className="kpi-measurements-progress" role="progressbar"
            aria-label={translate("metrics.eb724a908f1f")}>
            <span />
          </div>
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
                  capture_id={data.capture_id} · result_id={String(data.result_id).slice(0, 8)}
                </span>
              </div>
            )}
            {view === "table" ? (
              <div className="kpi-data-table kpi-metrics-table-body kpi-panel-enter relative" data-testid="metrics-table-panel" aria-busy={refreshing} ref={tablePanelRef}>
                {refreshing && (
                  <div className="kpi-panel-veil" data-testid="metrics-table-refreshing">
                    <div className="kpi-measurements-progress kpi-measurements-progress-overlay"
                      role="progressbar" aria-label={translate("metrics.eb724a908f1f")}>
                      <span />
                    </div>
                  </div>
                )}
                <div className="kpi-metrics-table-head">
                  <h3>{translate("metrics.tablePanel")}</h3>
                  <div className="flex gap-0.5 shrink-0 items-center">
                    <WorkspacePanelMenu label={translate("panel.actions")}>
                      <DropdownMenuItem
                        data-testid="metrics-table-export"
                        disabled={!data.csv}
                        onSelect={() => downloadCsv(data.csv, `metrics_${data.capture_id}`)}
                      >
                        <Download size={14} /> {translate("panel.export_csv")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid="metrics-table-fullscreen"
                        onSelect={() => void tablePanelRef.current?.requestFullscreen?.()}
                      >
                        <Maximize2 size={14} /> {translate("panel.fullscreen")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem data-testid="metrics-table-remove" onSelect={() => setPane("charts")}>
                        <X size={14} /> {translate("panel.remove")}
                      </DropdownMenuItem>
                    </WorkspacePanelMenu>
                    <button
                      type="button"
                      className="kpi-button"
                      aria-label={translate("panel.remove")}
                      title={translate("panel.remove")}
                      data-testid="metrics-table-close"
                      onClick={() => setPane("charts")}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="kpi-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="col-time">
                          Time local
                          <small className="block">{captureDate ?? "—"} · hh:mm:ss.sss</small>
                        </th>
                        <th className="col-time">
                          Time UTC
                          <small className="block">
                            {captureDate ?? "—"}
                            {data.utc_offset_min != null
                              ? ` · UTC${data.utc_offset_min >= 0 ? "+" : "−"}${Math.abs(data.utc_offset_min / 60)}h`
                              : " · offset —"}
                          </small>
                        </th>
                        <th className="col-geo numeric">
                          Latitude
                          <small className="block">°</small>
                        </th>
                        <th className="col-geo numeric">
                          Longitude
                          <small className="block">°</small>
                        </th>
                        {data.columns.map((c) => (
                          <th key={c.code} title={c.code} className="numeric">
                            {c.label}
                            <small className="block">{c.unit || "—"}</small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.slice((page - 1) * pageSize, page * pageSize).map((r) => {
                        const rowReason = reasonLabel(r.reason);
                        const utcMissing = r.time_utc == null;
                        const utcTooltip =
                          utcMissing && rowReason
                            ? rowReason
                            : `seq ${r.seq_first}–${r.seq_last} · t_rel ${r.t_rel_s}s`;
                        const gpsTooltip =
                          r.lat == null
                            ? (rowReason ?? "—")
                            : r.gps_source === "previous_fix" && r.gps_age_s != null
                              ? `previous fix · Δt ${r.gps_age_s.toFixed(1)}s`
                              : "exact fix";
                        return (
                          <tr key={r.second} data-second={r.second}>
                            <td
                              className="col-time font-mono text-[11px]"
                              title={`seq ${r.seq_first}–${r.seq_last} · t_rel ${r.t_rel_s}s`}
                            >
                              {r.time_local ?? r.time_label}
                            </td>
                            <td
                              className={`col-time font-mono text-[11px] ${utcMissing ? "text-muted-foreground opacity-60" : ""}`}
                              title={utcTooltip}
                            >
                              {r.time_utc ?? "—"}
                            </td>
                            <td
                              className={`col-geo numeric font-mono text-[11px] ${r.lat == null ? "text-muted-foreground opacity-60" : ""}`}
                              title={gpsTooltip}
                            >
                              {r.lat == null ? "—" : fmtLatLng(r.lat)}
                            </td>
                            <td
                              className={`col-geo numeric font-mono text-[11px] ${r.lon == null ? "text-muted-foreground opacity-60" : ""}`}
                              title={gpsTooltip}
                            >
                              {r.lon == null ? "—" : fmtLatLng(r.lon)}
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
                                  : r.values[c.code] == null
                                    ? "—"
                                    : fmt(r.values[c.code])}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
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
                    Showing {Math.min((page - 1) * pageSize + 1, data.rows.length)}–
                    {Math.min(page * pageSize, data.rows.length)} of {data.rows.length} rows
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
                      disabled={page * pageSize >= data.rows.length}
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
                    {p.type} : {p.success}/{p.known_outcomes} {translate("metrics.8df97de2b567")}{" "}
                    {fmt(p.success_pct)} % · {p.attempts} {translate("metrics.5ed4837057bd")}{" "}
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
  );
}
