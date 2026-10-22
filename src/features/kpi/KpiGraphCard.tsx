import { useTranslation } from "react-i18next";
import { KpiMeasurementMap } from "./KpiMeasurementMap";
import { Chronogram } from "./Chronogram";
import { MetricVsTimeChart } from "./MetricVsTimeChart";
import { TaskScatter } from "./TaskScatter";
import { TaskAnalytics, type TaskAnalyticsHandle } from "./TaskAnalytics";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { KpiChartSettings } from "./KpiChartSettings";
import { VisualizationItems } from "./VisualizationMenu";
import { GROUP_LABELS, type ChartConfig, type CurveType } from "./visualization-model";
import type { KpiGroupBy } from "@/lib/api/project-kpi-schemas";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Info,
  Maximize2,
  MoreVertical,
  RefreshCw,
  X,
} from "lucide-react";
import type { ECharts, EChartsOption } from "echarts";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectKpiDetail } from "@/lib/api/project-kpi-schemas";
import {
  type AnalyticRow,
  type Entry,
  type Statistic,
  STAT_LABELS,
  exportRows,
  formatValue,
  operatorColor,
  statistics,
  techLabel,
} from "./workspace-model";

export function KpiPlot({
  rows,
  selectedRows,
  onSelect,
  height = 235,
  onReady,
  mode = "histogram",
  curveType = "points",
}: {
  rows: AnalyticRow[];
  selectedRows: Set<string>;
  onSelect: (id: string) => void;
  height?: number;
  onReady?: (chart: ECharts | null) => void;
  mode?: "histogram" | "graph";
  curveType?: CurveType;
}) {
  const { t: translate } = useTranslation();
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<ECharts | null>(null);
  const [visible, setVisible] = useState(false),
    [error, setError] = useState(false);
  const callbacks = useRef(onSelect);
  callbacks.current = onSelect;
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries, observer) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 150,
      grid: { left: 58, right: 20, top: 28, bottom: rows.length > 5 ? 72 : 48 },
      tooltip: {
        trigger: "axis",
        confine: true,
        renderMode: "richText",
        valueFormatter: (value) => formatValue(Array.isArray(value) ? value[1] : value),
      },
      xAxis: {
        type: "category",
        data: rows.map((r) => r.label),
        axisLabel: {
          color: "#64748b",
          fontSize: 10,
          rotate: rows.length > 5 ? 25 : 0,
          width: 95,
          overflow: "truncate",
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#cbd5e1" } },
      },
      yAxis: {
        type: "value",
        name: rows[0]?.unit ?? "",
        scale: false,
        axisLabel: { color: "#64748b", fontSize: 10 },
        splitLine: { lineStyle: { color: "#e7edf5", type: "dashed" } },
      },
      series: [
        {
          type: mode === "graph" ? (curveType === "points" ? "scatter" : "line") : "bar",
          showSymbol: curveType === "line_points",
          connectNulls: false,
          smooth: false,
          symbolSize: 12,
          name: rows[0]?.metric ?? "",
          barMaxWidth: 46,
          data: rows.map((row, index) => ({
            value: mode === "graph" && curveType === "points" ? [index, row.value] : row.value,
            itemStyle: {
              color: operatorColor(row.operator),
              borderRadius: [3, 3, 0, 0],
              borderWidth: selectedRows.has(row.id) ? 3 : 0,
              borderColor: "#102a43",
              opacity: selectedRows.size && !selectedRows.has(row.id) ? 0.45 : 1,
            },
          })),
          label: {
            show: rows.length <= 12,
            position: "top",
            fontSize: 10,
            formatter: (params: { value?: unknown }) =>
              formatValue(Array.isArray(params.value) ? params.value[1] : params.value),
          },
        },
      ],
    }),
    [rows, selectedRows, mode, curveType],
  );
  const currentPlot = useRef({ option, rows });
  currentPlot.current = { option, rows };
  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);
  useEffect(() => {
    if (!visible || !host.current) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    import("echarts")
      .then((echarts) => {
        if (disposed || !host.current) return;
        chart.current = echarts.init(host.current, undefined, { renderer: "canvas" });
        chart.current.setOption(currentPlot.current.option);
        readyCallback.current?.(chart.current);
        chart.current.on("click", (event: unknown) => {
          const index = (event as { dataIndex?: number }).dataIndex;
          const row = index == null ? undefined : currentPlot.current.rows[index];
          if (row) callbacks.current(row.id);
        });
        observer = new ResizeObserver(() => chart.current?.resize());
        observer.observe(host.current);
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart.current?.dispose();
      chart.current = null;
      readyCallback.current?.(null);
    };
  }, [visible]);
  return (
    <div
      className="kpi-plot"
      style={{ height: height === 430 ? height : "var(--kpi-panel-chart-height, 235px)" }}
      ref={host}
      role="img"
      aria-label={`${mode === "graph" ? translate("kpi.1bbcd8f9d0c3") : translate("kpi.86eb05ab111d")} ${rows[0]?.metric ?? "KPI"} : ${rows.map((r) => `${r.label} ${formatValue(r.value)} ${r.unit ?? ""}`).join(" ; ")}`}
    >
      {!visible && <p className="kpi-chart-state">{translate("kpi.ad60f82629ae")}</p>}
      {error && (
        <p role="alert" className="p-4 text-sm">
          {" "}
          {translate("kpi.38224854ef6a")}{" "}
        </p>
      )}
    </div>
  );
}

export function KpiGraphCard({
  projectId,
  appliedFilters,
  captureId,
  onCaptureChange,
  entry,
  query,
  rows,
  statistic,
  onStatistic,
  active,
  onActivate,
  selectedRows,
  onSelectRow,
  onRemove,
  onMove,
  index,
  count,
  blockedReason,
  config,
  onConfig,
  groupOptions,
}: {
  projectId: string;
  appliedFilters: KpiQueryFilters;
  captureId: string | undefined;
  onCaptureChange: (capture: string) => void;
  entry: Entry;
  query: UseQueryResult<ProjectKpiDetail, Error>;
  rows: AnalyticRow[];
  statistic: Statistic;
  onStatistic: (value: Statistic) => void;
  active: boolean;
  onActivate: () => void;
  selectedRows: Set<string>;
  onSelectRow: (id: string) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  index: number;
  count: number;
  blockedReason?: string | undefined;
  config: ChartConfig;
  onConfig: (next: ChartConfig) => void;
  groupOptions: KpiGroupBy[];
}) {
  const { t: translate } = useTranslation();
  const seriesAvailable = !!entry.item.temporal_source;
  const taskView =
    config.visualization === "chronogram" ||
    config.visualization === "task_series" ||
    config.visualization === "task_scatter";
  const taskPanel = useRef<TaskAnalyticsHandle>(null);
  const [taskId, setTaskId] = useState<string>();

  const [info, setInfo] = useState(false),
    [full, setFull] = useState(false);
  const [settings, setSettings] = useState(false);
  const settingsRequested = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [plot, setPlot] = useState<ECharts | null>(null);
  const exportPng = () => {
    if (!plot || plot.isDisposed()) return;
    const link = document.createElement("a");
    link.href = plot.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#fff" });
    link.download = `${entry.item.code}.png`;
    link.click();
  };
  const data = query.data;
  const status = blockedReason
    ? "Unavailable"
    : query.isPending
      ? "Loading"
      : query.isError
        ? "Error"
        : data?.status === "AVAILABLE"
          ? rows.some((r) => r.value != null)
            ? "Available"
            : "Empty"
          : {
              PENDING: "Pending",
              UNVALIDATED: "Unvalidated",
              UNAVAILABLE: "Unavailable",
              NOT_APPLICABLE: "Unavailable",
            }[data?.status ?? "UNAVAILABLE"];
  const reason =
    blockedReason ??
    (query.isError
      ? query.error.message
      : (data?.reason ??
        (status === "Empty"
          ? data?.unit === "%"
            ? translate("kpi.ef497da95fa0")
            : translate("kpi.33de0f18df8f")
          : translate("kpi.26bea1feb8ec"))));
  const choices = data ? statistics(data) : [];
  const operators = [
    ...new Set(
      rows.map(
        (r) =>
          r.operator ??
          (config.groupBy === "none"
            ? translate("kpi.f6306ab41d27")
            : translate("kpi.51d3aaf58c26")),
      ),
    ),
  ];
  const body = (
    <>
      {config.visualization === "map" ? (
        <KpiMeasurementMap
          projectId={projectId}
          code={entry.item.code}
          captureId={captureId}
          onCaptureChange={onCaptureChange}
          filters={appliedFilters}
        />
      ) : taskView && blockedReason ? (
        <div className="kpi-chart-state" role="status">
          {blockedReason}
        </div>
      ) : config.visualization === "task_series" && !seriesAvailable ? (
        <div className="kpi-chart-state" role="status">
          {" "}
          {translate("kpi.20b75fa9e2fc")}{" "}
        </div>
      ) : config.visualization === "chronogram" ? (
        <Chronogram
          ref={taskPanel}
          projectId={projectId}
          filters={appliedFilters}
          selectedCapture={captureId}
          onCaptureChange={onCaptureChange}
        />
      ) : config.visualization === "graph" && seriesAvailable ? (
        // 1.42.0 — Metric vs Time : si le KPI a `temporal_source` non-null,
        // la vue Graphique rend la courbe (time_s, value) issue de la route
        // générique `/captures/{cid}/kpi/{code}/time-series`. Pas de bouton,
        // pas de panneau : branche indépendante de la requête KPI agrégée.
        // Si aucune capture n'est encore active au workspace, le composant
        // auto-sélectionne la première capture connue via /metrics/captures
        // (règle du mandat #2 — ne pas demander de sélection manuelle).
        <MetricVsTimeChart
          curveType={config.curveType ?? "line"}
          projectId={projectId}
          captureId={captureId}
          onCaptureChange={onCaptureChange}
          code={entry.item.code}
          unit={entry.item.unit ?? null}
          height={full ? 430 : 235}
        />
      ) : config.visualization === "task_scatter" && !blockedReason ? (
        <TaskScatter
          ref={taskPanel}
          projectId={projectId}
          code={entry.item.code}
          filters={appliedFilters}
        />
      ) : taskView && !blockedReason ? (
        <TaskAnalytics
          curveType={config.curveType ?? "line"}
          key={JSON.stringify(appliedFilters)}
          ref={taskPanel}
          projectId={projectId}
          code={entry.item.code}
          unit={entry.item.unit ?? ""}
          filters={{ ...appliedFilters, group_by: config.groupBy }}
          taskId={taskId}
          setTaskId={setTaskId}
          onCaptureChange={onCaptureChange}
        />
      ) : status === "Loading" ? (
        <div className="kpi-chart-state animate-pulse" role="status">
          {" "}
          {translate("kpi.705a2156c1b4")}{" "}
        </div>
      ) : status !== "Available" ? (
        <div className="kpi-chart-state" role={status === "Error" ? "alert" : "status"}>
          <strong>{status === "Error" ? translate("kpi.f1d7675032b2") : status}</strong>
          <p>
            {query.isError
              ? /contract|contrat|expected|schema/i.test(reason)
                ? translate("kpi.b058be3e63f7")
                : translate("kpi.3e274b917f78")
              : reason}
          </p>
          {query.isError && (
            <details className="kpi-error-details">
              <summary>{translate("kpi.e6c5023dd74d")}</summary>
              <pre>{reason}</pre>
            </details>
          )}
          {query.isError && (
            <button className="kpi-button" onClick={() => void query.refetch()}>
              <RefreshCw size={13} /> {translate("kpi.af273d956b5b")}{" "}
            </button>
          )}
        </div>
      ) : config.visualization === "table" ? (
        <div className="kpi-table-mode" role="status">
          <p> {translate("kpi.34b95a87be37")} </p>
          <button
            className="kpi-button"
            onClick={() => {
              setFull(false);
              document
                .getElementById("kpi-workspace-data")
                ?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
          >
            {" "}
            {translate("kpi.950a63aea890")}{" "}
          </button>
        </div>
      ) : (
        <KpiPlot
          curveType={config.curveType ?? "points"}
          rows={rows}
          onReady={setPlot}
          mode={config.visualization === "graph" ? "graph" : "histogram"}
          selectedRows={selectedRows}
          onSelect={onSelectRow}
          height={full ? 430 : 235}
        />
      )}
      {status === "Available" && ["histogram", "graph"].includes(config.visualization) && (
        <div className="kpi-chart-legend">
          {operators.map((operator) => (
            <span key={operator}>
              <i style={{ backgroundColor: operatorColor(operator) }} />
              {operator}
            </span>
          ))}
        </div>
      )}
    </>
  );
  return (
    <article
      id={`kpi-graph-${entry.item.code}`}
      className={`kpi-graph-card ${active ? "is-active" : ""}`}
      data-code={entry.item.code}
      data-visualization={config.visualization}
      data-status={status}
      onFocus={onActivate}
    >
      <header className="kpi-card-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="kpi-order">{index + 1}</span>
            <h3 title={entry.item.name}>{entry.item.name}</h3>
          </div>
          <p>
            {techLabel(entry.techno)} · {entry.family} ·{" "}
            {data?.unit ?? entry.item.unit ?? translate("kpi.8246d8942ee4")}
          </p>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <Popover open={settings} onOpenChange={setSettings}>
            <PopoverAnchor asChild>
              <span className="inline-flex">
                <WorkspacePanelMenu
                  label={`Actions ${entry.item.name}`}
                  triggerRef={menuButton}
                  onCloseAutoFocus={(event) => {
                    if (settingsRequested.current) {
                      event.preventDefault();
                      settingsRequested.current = false;
                      requestAnimationFrame(() => setSettings(true));
                    }
                  }}
                >
                    <DropdownMenuItem
                      onSelect={() => (taskView ? taskPanel.current?.info() : setInfo(true))}
                    >
                      <Info size={14} /> {translate("panel.info")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setFull(true)}>
                      <Maximize2 size={14} /> {translate("panel.fullscreen")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{translate("kpi.a9b06cf1234b")}</DropdownMenuLabel>
                    <VisualizationItems
                      excludeGraph
                      throughput={seriesAvailable}
                      seriesAvailable={seriesAvailable}
                      onChange={(visualization) => onConfig({ ...config, visualization })}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      title={taskView ? translate("kpi.853624eed2fd") : undefined}
                      disabled={
                        config.visualization === "task_scatter" ||
                        config.visualization === "chronogram"
                      }
                      onSelect={() => {
                        settingsRequested.current = true;
                      }}
                    >
                      {" "}
                      {translate("kpi.c50196dca9cc")}{" "}
                    </DropdownMenuItem>
                    <DropdownMenuLabel>{translate("kpi.4d7107c7bbd7")}</DropdownMenuLabel>
                    {groupOptions.map((group) => (
                      <DropdownMenuItem
                        key={group}
                        disabled={taskView}
                        title={taskView ? translate("kpi.2403c2e13659") : undefined}
                        onSelect={() => onConfig({ ...config, groupBy: group, xMetric: group })}
                      >
                        {GROUP_LABELS[group]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuLabel>{translate("kpi.a6fc812e6cb4")}</DropdownMenuLabel>
                    {choices.map((stat) => (
                      <DropdownMenuItem
                        key={stat}
                        disabled={taskView}
                        title={taskView ? translate("kpi.4ad1fbe164ab") : undefined}
                        onSelect={() => onStatistic(stat)}
                      >
                        {STAT_LABELS[stat]}
                      </DropdownMenuItem>
                    ))}
                    {!choices.length && (
                      <DropdownMenuItem disabled>{translate("kpi.c4e1ed3eaecc")}</DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      title={
                        taskView ? translate("kpi.88838bdebe9c") : translate("kpi.71776885807e")
                      }
                      disabled={
                        !plot ||
                        !["histogram", "graph"].includes(config.visualization) ||
                        status !== "Available"
                      }
                      onSelect={exportPng}
                    >
                      {" "}
                      {translate("kpi.724ac19af72e")}{" "}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!taskView && !rows.length}
                      onSelect={() =>
                        taskView ? taskPanel.current?.csv() : exportRows(rows, entry.item.code)
                      }
                    >
                      {" "}
                      {translate("kpi.b84f9613287b")}{" "}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
                      <ArrowLeft size={14} /> {translate("kpi.e88429ea6b60")}{" "}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
                      <ArrowRight size={14} /> {translate("kpi.e26063a217d2")}{" "}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onRemove}>
                      <X size={14} /> {translate("kpi.bc0501383465")}{" "}
                    </DropdownMenuItem>
                </WorkspacePanelMenu>
              </span>
            </PopoverAnchor>
            <PopoverContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                menuButton.current?.focus();
              }}
              align="end"
              className="w-[340px] max-w-[calc(100vw-24px)] max-h-[85vh] overflow-y-auto"
            >
              {settings && (
                <KpiChartSettings
                  config={{
                    ...config,
                    statistic,
                    curveType: config.curveType ?? (seriesAvailable ? "line" : "points"),
                  }}
                  temporal={
                    (seriesAvailable && config.visualization === "graph") ||
                    config.visualization === "task_series"
                  }
                  name={entry.item.name}
                  unit={data?.unit ?? entry.item.unit ?? null}
                  choices={choices}
                  groupOptions={groupOptions}
                  onCancel={() => setSettings(false)}
                  onApply={(next) => {
                    onConfig(next);
                    setSettings(false);
                  }}
                />
              )}
            </PopoverContent>
          </Popover>
        </div>
      </header>
      {/* 1.43.0 — toolbar « Vue » + bouton « BLER / temps par capture »
          + ligne meta « Série temporelle · … » + sélecteur Statistique
          permanent ont été retirés de l'affichage principal. Toutes ces
          commandes restent accessibles via le menu ⋮ (VisualizationItems,
          Statistique, Configurer X/Y). Le badge d'état reste exposé en
          haut à droite pour que l'utilisateur voie Loading / Error /
          Available sans ouvrir la carte. */}
      {status !== "Available" || taskView ? (
        <div className="kpi-card-state-row" aria-live="polite">
          <span className={`kpi-state state-${status.toLowerCase()}`}>
            {config.visualization === "chronogram"
              ? translate("kpi.a7947fb8c07b")
              : config.visualization === "task_scatter"
                ? translate("kpi.388e3e33d196")
                : taskView
                  ? "Task Time"
                  : status}
          </span>
        </div>
      ) : null}
      {!full && body}
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="max-w-[94vw] w-[1100px]">
          <DialogHeader>
            <DialogTitle>{entry.item.name}</DialogTitle>
            <DialogDescription>
              {STAT_LABELS[statistic]} · {data?.unit ?? entry.item.unit ?? "—"}{" "}
              {translate("kpi.e81fea56c8f7")}{" "}
            </DialogDescription>
          </DialogHeader>
          {full && body}
        </DialogContent>
      </Dialog>
      <Sheet open={info} onOpenChange={setInfo}>
        <SheetContent className="w-[430px] sm:max-w-[430px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{entry.item.name}</SheetTitle>
            <SheetDescription> {translate("kpi.7fae579aed13")} </SheetDescription>
          </SheetHeader>
          <dl className="kpi-info-list">
            {Object.entries({
              "Code KPI": entry.item.code,
              Technologie: data?.techno ?? entry.techno,
              Famille: data?.family ?? entry.family,
              Nature: data?.nature ?? entry.item.nature,
              Unité: data?.unit ?? entry.item.unit,
              Formule: data?.formula ?? entry.item.formula,
              Source: data?.source ?? entry.item.source,
              Population: data?.n,
              Dénominateur: data?.["denominator"],
              result_id: data?.["result_id"],
              "Statut de validation": data?.status ?? entry.item.status,
              Raison: data?.reason ?? entry.item.reason,
            })
              .filter(([, value]) => value != null)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {" "}
            {translate("kpi.154d3daccf41")}{" "}
          </p>
          <p className="mt-3 text-xs text-muted-foreground"> {translate("kpi.2d9edb679f3a")} </p>
        </SheetContent>
      </Sheet>
    </article>
  );
}
