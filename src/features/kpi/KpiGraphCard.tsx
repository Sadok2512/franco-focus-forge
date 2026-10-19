import { Chronogram } from "./Chronogram";
import { TaskScatter } from "./TaskScatter";
import { TaskAnalytics, type TaskAnalyticsHandle } from "./TaskAnalytics";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { KpiChartSettings } from "./KpiChartSettings";
import { VisualizationItems } from "./VisualizationMenu";
import { MAP_UNAVAILABLE, GROUP_LABELS, type ChartConfig } from "./visualization-model";
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
  DropdownMenu,
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
}: {
  rows: AnalyticRow[];
  selectedRows: Set<string>;
  onSelect: (id: string) => void;
  height?: number;
  onReady?: (chart: ECharts | null) => void;
  mode?: "histogram" | "graph";
}) {
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
          type: mode === "graph" ? "scatter" : "bar",
          symbolSize: 12,
          name: rows[0]?.metric ?? "",
          barMaxWidth: 46,
          data: rows.map((row, index) => ({
            value: mode === "graph" ? [index, row.value] : row.value,
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
    [rows, selectedRows, mode],
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
      style={{ height }}
      ref={host}
      role="img"
      aria-label={`${mode === "graph" ? "Graphique en points agrégés" : "Histogramme"} ${rows[0]?.metric ?? "KPI"} : ${rows.map((r) => `${r.label} ${formatValue(r.value)} ${r.unit ?? ""}`).join(" ; ")}`}
    >
      {!visible && <p className="kpi-chart-state">Rendu du graphique à l’affichage…</p>}
      {error && (
        <p role="alert" className="p-4 text-sm">
          Le graphique n’a pas pu être rendu. Les valeurs restent disponibles dans Données.
        </p>
      )}
    </div>
  );
}

export function KpiGraphCard({
  projectId,
  appliedFilters,
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
  const taskView =
    config.visualization === "chronogram" ||
    config.visualization === "task_series" ||
    config.visualization === "task_scatter";
  const taskPanel = useRef<TaskAnalyticsHandle>(null);
  const [taskId, setTaskId] = useState<string>();
  useEffect(() => {
    setTaskId(undefined);
  }, [appliedFilters]);
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
            ? "Aucun pourcentage affichable : valeur validée et dénominateur explicite positif requis."
            : "Aucune valeur validée pour cette population et cette statistique."
          : "Aucune donnée validée pour cette métrique.")));
  const choices = data ? statistics(data) : [];
  const operators = [...new Set(rows.map((r) => r.operator ?? "Non attribué"))];
  const body = (
    <>
      {config.visualization === "chronogram" ? (
        <Chronogram ref={taskPanel} projectId={projectId} filters={appliedFilters} />
      ) : config.visualization === "task_scatter" && !blockedReason ? (
        <TaskScatter
          ref={taskPanel}
          projectId={projectId}
          code={entry.item.code}
          filters={appliedFilters}
        />
      ) : taskView && !blockedReason ? (
        <TaskAnalytics
          key={JSON.stringify(appliedFilters)}
          ref={taskPanel}
          projectId={projectId}
          code={entry.item.code}
          unit={entry.item.unit ?? ""}
          filters={appliedFilters}
          taskId={taskId}
          setTaskId={setTaskId}
        />
      ) : status === "Loading" ? (
        <div className="kpi-chart-state animate-pulse" role="status">
          Chargement de la métrique…
        </div>
      ) : status !== "Available" ? (
        <div className="kpi-chart-state" role={status === "Error" ? "alert" : "status"}>
          <strong>{status === "Error" ? "Données indisponibles" : status}</strong>
          <p>
            {query.isError
              ? /contract|contrat|expected|schema/i.test(reason)
                ? "La réponse du service ne respecte pas le contrat attendu."
                : "Le service n’a pas pu charger cette métrique. Réessayez."
              : reason}
          </p>
          {query.isError && (
            <details className="kpi-error-details">
              <summary>Voir le détail technique</summary>
              <pre>{reason}</pre>
            </details>
          )}
          {query.isError && (
            <button className="kpi-button" onClick={() => void query.refetch()}>
              <RefreshCw size={13} />
              Réessayer
            </button>
          )}
        </div>
      ) : config.visualization === "map" ? (
        <div className="kpi-chart-state" role="status">
          <strong>Carte indisponible</strong>
          <p>{MAP_UNAVAILABLE}</p>
        </div>
      ) : config.visualization === "table" ? (
        <div className="kpi-table-mode" role="status">
          <p>
            Les données de ce KPI figurent dans le tableau Données, avec les autres KPI
            sélectionnés.
          </p>
          <button
            className="kpi-button"
            onClick={() => {
              setFull(false);
              document
                .getElementById("kpi-workspace-data")
                ?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
          >
            Voir les données
          </button>
        </div>
      ) : (
        <KpiPlot
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
            {data?.unit ?? entry.item.unit ?? "Unité non renseignée"}
          </p>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button
            className="kpi-icon"
            title="Infos et preuves"
            aria-label={`Infos ${entry.item.name}`}
            onClick={() => (taskView ? taskPanel.current?.info() : setInfo(true))}
          >
            <Info size={15} />
          </button>
          <button
            className="kpi-icon"
            title="Exporter les données CSV"
            aria-label={`Exporter ${entry.item.name}`}
            disabled={!taskView && !rows.length}
            onClick={() =>
              taskView ? taskPanel.current?.csv() : exportRows(rows, entry.item.code)
            }
          >
            <Download size={15} />
          </button>
          <button
            className="kpi-icon"
            title="Plein écran"
            aria-label={`Plein écran ${entry.item.name}`}
            onClick={() => setFull(true)}
          >
            <Maximize2 size={15} />
          </button>
          <Popover open={settings} onOpenChange={setSettings}>
            <PopoverAnchor asChild>
              <span className="inline-flex">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      ref={menuButton}
                      className="kpi-icon"
                      aria-label={`Actions ${entry.item.name}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onCloseAutoFocus={(event) => {
                      if (settingsRequested.current) {
                        event.preventDefault();
                        settingsRequested.current = false;
                        requestAnimationFrame(() => setSettings(true));
                      }
                    }}
                  >
                    <DropdownMenuLabel>Paramètres du graphique</DropdownMenuLabel>
                    <VisualizationItems
                      throughput={entry.item.unit === "Mbit/s"}
                      onChange={(visualization) => onConfig({ ...config, visualization })}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      title={
                        taskView ? "Task Time et unité définis par le contrat de série" : undefined
                      }
                      disabled={taskView}
                      onSelect={() => {
                        settingsRequested.current = true;
                      }}
                    >
                      Configurer X / Y
                    </DropdownMenuItem>
                    <DropdownMenuLabel>Regroupement</DropdownMenuLabel>
                    {groupOptions.map((group) => (
                      <DropdownMenuItem
                        key={group}
                        disabled={taskView}
                        title={
                          taskView
                            ? "La série utilise les opérateurs et points de l’API"
                            : undefined
                        }
                        onSelect={() => onConfig({ ...config, groupBy: group, xMetric: group })}
                      >
                        {GROUP_LABELS[group]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuLabel>Statistique</DropdownMenuLabel>
                    {choices.map((stat) => (
                      <DropdownMenuItem
                        key={stat}
                        disabled={taskView}
                        title={taskView ? "Percentiles fournis par le contrat de série" : undefined}
                        onSelect={() => onStatistic(stat)}
                      >
                        {STAT_LABELS[stat]}
                      </DropdownMenuItem>
                    ))}
                    {!choices.length && (
                      <DropdownMenuItem disabled>Aucune statistique disponible</DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      title={
                        taskView
                          ? "Export PNG de la série non disponible ; les points sont exportables en CSV"
                          : "Exporter le graphique disponible"
                      }
                      disabled={
                        !plot ||
                        !["histogram", "graph"].includes(config.visualization) ||
                        status !== "Available"
                      }
                      onSelect={exportPng}
                    >
                      Exporter PNG
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!taskView && !rows.length}
                      onSelect={() =>
                        taskView ? taskPanel.current?.csv() : exportRows(rows, entry.item.code)
                      }
                    >
                      Exporter CSV
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
                      <ArrowLeft size={14} />
                      Déplacer avant
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
                      <ArrowRight size={14} />
                      Déplacer après
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onRemove}>
                      <X size={14} />
                      Retirer le graphique
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                  config={{ ...config, statistic }}
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
      <div className="kpi-card-meta">
        <span className={`kpi-state state-${status.toLowerCase()}`}>
          {config.visualization === "chronogram"
            ? "Chronogramme"
            : config.visualization === "task_scatter"
              ? "Nuage"
              : taskView
                ? "Task Time"
                : status}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {taskView
            ? config.visualization === "task_scatter"
              ? "Observations appariées · points API"
              : "Série temporelle · points API"
            : config.visualization === "graph"
              ? "Points agrégés · aucune série temporelle"
              : "Comparaison des agrégats"}
        </span>
        {taskView ? null : choices.length > 1 ? (
          <select
            aria-label={`Statistique ${entry.item.name}`}
            value={statistic}
            onChange={(e) => onStatistic(e.target.value as Statistic)}
          >
            {choices.map((s) => (
              <option key={s} value={s}>
                {STAT_LABELS[s]}
              </option>
            ))}
          </select>
        ) : choices.length === 1 ? (
          <span className="ml-auto text-[11px]">{STAT_LABELS[statistic]}</span>
        ) : null}
      </div>
      {!full && body}
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="max-w-[94vw] w-[1100px]">
          <DialogHeader>
            <DialogTitle>{entry.item.name}</DialogTitle>
            <DialogDescription>
              {STAT_LABELS[statistic]} · {data?.unit ?? entry.item.unit ?? "—"} · mêmes filtres
              appliqués
            </DialogDescription>
          </DialogHeader>
          {full && body}
        </DialogContent>
      </Dialog>
      <Sheet open={info} onOpenChange={setInfo}>
        <SheetContent className="w-[430px] sm:max-w-[430px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{entry.item.name}</SheetTitle>
            <SheetDescription>
              Définition et preuves du catalogue et de la réponse API.
            </SheetDescription>
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
            Comparabilité : vérifier les sources, unités, formules et populations avant de comparer
            deux métriques. Aucun référentiel temporel commun n’est établi par cette réponse.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Task Time indisponible dans ce contrat. Aucune série temporelle, interpolation ou
            concaténation de captures n’est créée.
          </p>
        </SheetContent>
      </Sheet>
    </article>
  );
}
