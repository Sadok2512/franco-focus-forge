import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ECharts, EChartsOption } from "echarts";
import {
  getMetrics,
  getMetricCaptures,
  getMetricSeries,
  getCaptureEvents,
  getUnknownMetrics,
  getProjectTasks,
} from "@/lib/api/client";
import type { ChronogramData, ChronogramEvents } from "@/lib/api/metrics";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { toUserMessage } from "@/lib/api/http";
import { DecodePanel } from "@/features/projects/DecodePanel";
const palette = [
  "#60a5fa",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#e879f9",
  "#f87171",
];
function metricColor(code: string) {
  const layer = [
    "pdsch_bitrate",
    "mac_dl_bitrate",
    "rlc_dl_bitrate",
    "pdcp_dl_bitrate",
    "thr_dl",
    "pdsch_bler",
    "mac_dl_bler",
    "cqi",
    "sinr",
  ].indexOf(code);
  if (layer >= 0) return palette[layer];
  return palette[
    [...code].reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) >>> 0, 0) % palette.length
  ];
}
function saveCsv(data: ChronogramData) {
  const url = URL.createObjectURL(new Blob([data.csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `chronogramme-${data.capture_id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
function Plot({
  data,
  events,
  stacked,
  start,
  end,
}: {
  data: ChronogramData;
  events?: ChronogramEvents | undefined;
  stacked: boolean;
  start?: number | undefined;
  end?: number | undefined;
}) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<ECharts | null>(null);
  const [ready, setReady] = useState(false);
  const numeric = data.series.filter((s) => s.kind === "numeric");
  const categories = data.series.filter((s) => s.kind === "categorical");
  // Panels only: no summation of throughputs from different protocol layers.
  const panels = stacked
    ? [...new Set(numeric.map((s) => (s.unit === "Mbit/s" ? s.code : s.unit)))]
    : ["all"];
  const height = stacked
    ? Math.max(1, panels.length) * 125 + categories.length * 65 + 110
    : 490 + categories.length * 65;
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    void import("echarts").then((e) => {
      if (disposed || !host.current) return;
      chart.current = e.init(host.current);
      observer = new ResizeObserver(() => chart.current?.resize());
      observer.observe(host.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !chart.current) return;
    const numeric = data.series.filter((s) => s.kind === "numeric"),
      categories = data.series.filter((s) => s.kind === "categorical");
    const units = [...new Set(numeric.map((s) => s.unit))];
    const panels = stacked
      ? [...new Set(numeric.map((s) => (s.unit === "Mbit/s" ? s.code : s.unit)))]
      : ["all"];
    if (!panels.length) panels.push("all");
    const panelOf = (s: (typeof numeric)[number]) =>
      stacked ? panels.indexOf(s.unit === "Mbit/s" ? s.code : s.unit) : 0;
    const categoryTop = stacked ? panels.length * 125 + 65 : 395;
    const grids = [
      ...panels.map((_, i) => ({
        left: 80,
        right: stacked ? 65 : 210,
        top: stacked ? 65 + i * 125 : 75,
        height: stacked ? 88 : 280,
      })),
      ...categories.map((_, i) => ({ left: 80, right: 65, top: categoryTop + i * 65, height: 42 })),
    ];
    const xAxis = grids.map((_, i) => ({
      type: "value" as const,
      gridIndex: i,
      min: start ?? 0,
      max: end ?? data.duration_s,
      name: i === grids.length - 1 ? "Temps capture (s)" : "",
      nameLocation: "middle" as const,
      nameGap: 24,
      axisLabel: { show: !stacked || i === grids.length - 1, color: "#cbd5e1" },
      splitLine: { lineStyle: { color: "#334155" } },
    }));
    const numericAxes = stacked
      ? panels.map((p, i) => ({
          type: "value" as const,
          gridIndex: i,
          name: numeric.find((s) => panelOf(s) === i)?.unit ?? "",
          scale: true,
          axisLabel: { color: "#cbd5e1" },
          splitLine: { lineStyle: { color: "#334155" } },
        }))
      : (units.length ? units : [""]).map((u, i) => ({
          type: "value" as const,
          gridIndex: 0,
          name: u,
          position: i === 0 ? ("left" as const) : ("right" as const),
          offset: i < 2 ? 0 : (i - 1) * 65,
          scale: true,
          axisLabel: { color: "#cbd5e1" },
          splitLine: { show: i === 0, lineStyle: { color: "#334155" } },
        }));
    const yAxis = [
      ...numericAxes,
      ...categories.map((s, i) => ({
        type: "value" as const,
        gridIndex: panels.length + i,
        min: 0,
        max: 1,
        name: s.label,
        axisLabel: { show: false },
        splitLine: { show: false },
        axisTick: { show: false },
      })),
    ];
    const markers = (events?.markers ?? [])
      .filter(
        (e) =>
          (start === undefined || e.t_rel_s >= start) && (end === undefined || e.t_rel_s <= end),
      )
      .map((e) => ({
        name: e.label,
        xAxis: e.t_rel_s,
        label: {
          formatter: e.type === "task" ? e.label.split(" · ")[0] : e.type.toUpperCase(),
          rotate: 90,
          position: "insideEndTop",
          fontSize: 9,
          color: "#fbbf24",
        },
        lineStyle: { color: "#fbbf24", opacity: 0.55 },
      }));
    const lines = numeric.map((s) => ({
      name: s.label,
      type: "line" as const,
      xAxisIndex: panelOf(s),
      yAxisIndex: stacked ? panelOf(s) : units.indexOf(s.unit),
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 1.5, color: metricColor(s.code) },
      itemStyle: { color: metricColor(s.code) },
      data: s.points.map((p) => ({ value: [p.t_rel_s, p.value], tooltipText: p.tooltip })),
    }));
    const bands = categories.map((s, i) => ({
      name: s.label,
      type: "line" as const,
      xAxisIndex: panels.length + i,
      yAxisIndex: numericAxes.length + i,
      data: [],
      markArea: {
        label: { show: true, color: "#f8fafc", fontSize: 10, position: "inside" },
        data: s.segments.map((seg) => [
          {
            name: `${s.label}: ${seg.value}`,
            xAxis: seg.start_s,
            itemStyle: {
              color: palette[s.states.indexOf(seg.value) % palette.length],
              opacity: 0.55,
            },
          },
          { xAxis: seg.end_s },
        ]),
      },
    }));
    chart.current.setOption(
      {
        animation: false,
        backgroundColor: "#0f172a",
        textStyle: { color: "#cbd5e1" },
        legend: { top: 5, textStyle: { color: "#cbd5e1" }, type: "scroll" },
        title: stacked
          ? panels.map((_, i) => ({
              text: numeric
                .filter((s) => panelOf(s) === i)
                .map((s) => s.label)
                .join(" / "),
              left: 120,
              top: 43 + i * 125,
              textStyle: { color: "#cbd5e1", fontSize: 11, fontWeight: "normal" },
            }))
          : [],
        grid: grids,
        xAxis,
        yAxis,
        tooltip: {
          trigger: "axis",
          renderMode: "richText",
          confine: true,
          formatter: (params: unknown) => {
            const items = params as { data?: { tooltipText?: string }; name?: string }[];
            return (
              items.find((p) => p.data?.tooltipText)?.data?.tooltipText ?? items[0]?.name ?? ""
            );
          },
        },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        dataZoom: [
          { type: "inside", xAxisIndex: grids.map((_, i) => i), filterMode: "none" },
          {
            type: "slider",
            xAxisIndex: grids.map((_, i) => i),
            filterMode: "none",
            bottom: 5,
            textStyle: { color: "#cbd5e1" },
          },
        ],
        toolbox: {
          right: 0,
          feature: {
            dataZoom: { yAxisIndex: "none" },
            restore: {},
            saveAsImage: { backgroundColor: "#0f172a" },
          },
        },
        series: [
          ...lines,
          ...bands,
          ...panels.map((_, i) => ({
            type: "line",
            xAxisIndex: i,
            yAxisIndex: stacked ? i : 0,
            data: [],
            markLine: { symbol: "none", silent: true, data: markers },
          })),
        ],
      } as EChartsOption,
      true,
    );
  }, [ready, data, events, stacked, start, end]);
  return (
    <>
      <button
        className="kpi-button"
        onClick={() =>
          chart.current?.dispatchAction({ type: "dataZoom", startValue: 0, endValue: 30 })
        }
      >
        Zoom 0–30 s
      </button>
      {stacked && (
        <p className="text-xs text-muted-foreground">
          Panneaux empilés · débits par couche non cumulés · temps commun à la capture
        </p>
      )}
      <div ref={host} data-testid="chronogram-chart" style={{ height }} />
    </>
  );
}
export const Chronogram = forwardRef<
  { info: () => void; csv: () => void },
  { projectId: string; filters: KpiQueryFilters }
>(({ projectId, filters }, ref) => {
  const [selectedCapture, setCapture] = useState<string>(),
    [selectedCodes, setCodes] = useState<string[]>(["rsrp", "sinr", "thr_dl"]),
    [info, setInfo] = useState(false),
    [stacked, setStacked] = useState(false),
    [taskId, setTaskId] = useState(""),
    [unknownEvent, setUnknownEvent] = useState("CHI"),
    [unknownOpen, setUnknownOpen] = useState(false);
  const metrics = useQuery({
    queryKey: ["metrics", projectId],
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => getMetrics(projectId, signal),
  });
  const unknown = useQuery({
    queryKey: ["unknown-metrics", projectId],
    enabled: unknownOpen,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => getUnknownMetrics(projectId, signal),
  });
  const tasks = useQuery({
    queryKey: ["tasks", projectId, filters],
    queryFn: ({ signal }) => getProjectTasks(projectId, filters, signal),
  });
  const captures = useQuery({
    queryKey: ["metric-captures", projectId, filters],
    queryFn: ({ signal }) => getMetricCaptures(projectId, filters, signal),
  });
  const cap =
    captures.data?.find((c) => c.capture_id === selectedCapture)?.capture_id ??
    captures.data?.[0]?.capture_id;
  const codes = selectedCodes.filter((code) => metrics.data?.some((m) => m.code === code));
  const task = tasks.data?.tasks.find((t) => t.id === taskId && t.capture_id === cap);
  const series = useQuery({
    queryKey: ["metric-series", projectId, cap, codes, task?.id],
    queryFn: ({ signal }) =>
      getMetricSeries(
        projectId,
        cap!,
        codes,
        signal,
        task ? { from_seq: task.seq_start, to_seq: task.seq_end } : undefined,
      ),
    enabled: !!cap && codes.length > 0,
  });
  const events = useQuery({
    queryKey: ["capture-events", projectId, cap],
    queryFn: ({ signal }) => getCaptureEvents(projectId, cap!, signal),
    enabled: !!cap,
  });
  const data = codes.length ? series.data : undefined;
  useImperativeHandle(ref, () => ({
    info: () => setInfo((v) => !v),
    csv: () => {
      if (data) saveCsv(data);
    },
  }));
  const error =
    metrics.error ?? captures.error ?? series.error ?? events.error ?? unknown.error ?? tasks.error;
  const eventGroups = [...new Set(metrics.data?.map((m) => m.event_code) ?? [])].sort();
  return (
    <section className="p-4 space-y-3" data-testid="chronogram">
      <DecodePanel projectId={projectId} />
      <div className="flex flex-wrap items-center gap-3">
        <label>
          Capture{" "}
          <select
            className="kpi-button"
            aria-label="Capture du chronogramme"
            value={cap ?? ""}
            onChange={(e) => {
              setCapture(e.target.value);
              setTaskId("");
            }}
          >
            {captures.data?.map((c) => (
              <option key={c.capture_id} value={c.capture_id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button className="kpi-button" disabled={!data} onClick={() => data && saveCsv(data)}>
          CSV des points
        </button>
      </div>
      {cap && <DecodePanel projectId={projectId} captureId={cap} />}
      <div className="flex flex-wrap gap-3 items-center text-xs">
        <label>
          Tâche{" "}
          <select
            className="kpi-button"
            aria-label="Tâche du chronogramme"
            value={task?.id ?? ""}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">Toute la capture</option>
            {tasks.data?.tasks
              .filter((t) => t.capture_id === cap)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.task_type} · seq {t.seq_start}–{t.seq_end}
                </option>
              ))}
          </select>
        </label>
        <button
          className="kpi-button disabled:opacity-50"
          disabled={!metrics.data}
          onClick={() => {
            setCodes(
              [
                "pdsch_bitrate",
                "mac_dl_bitrate",
                "rlc_dl_bitrate",
                "pdcp_dl_bitrate",
                "thr_dl",
                "pdsch_bler",
                "mac_dl_bler",
                "cqi",
                "sinr",
              ].filter((c) => metrics.data?.some((m) => m.code === c)),
            );
            setStacked(true);
          }}
        >
          Débits par couche + BLER / CQI / SINR
        </button>
        <label className="flex gap-2">
          <input type="checkbox" checked={stacked} onChange={(e) => setStacked(e.target.checked)} />
          Panneaux empilés
        </label>
      </div>
      <details className="rounded border border-border p-3" data-testid="metric-selector">
        <summary className="cursor-pointer text-sm font-medium">Métriques par événement</summary>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 max-h-96 overflow-auto mt-3">
          {eventGroups.map((eventCode) => (
            <fieldset key={eventCode} className="text-xs space-y-1">
              <legend className="font-semibold mb-1">{eventCode}</legend>
              {metrics.data
                ?.filter((m) => m.event_code === eventCode)
                .map((m) => (
                  <label
                    key={m.code}
                    className="flex gap-2 items-center"
                    title={`${m.source_table}.${m.source_column}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={m.label}
                      checked={codes.includes(m.code)}
                      onChange={(e) =>
                        setCodes(
                          e.target.checked
                            ? [...selectedCodes, m.code]
                            : selectedCodes.filter((c) => c !== m.code),
                        )
                      }
                    />
                    {m.label} ({m.unit})
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
      </details>
      <details
        className="rounded border border-border p-3"
        data-testid="unknown-metrics"
        onToggle={(e) => setUnknownOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Non documentés — position non prouvée (NFF 2.19)
        </summary>
        {unknown.isFetching && <p role="status">Chargement des champs non documentés…</p>}
        <label className="block text-xs mt-3">
          Événement{" "}
          <select
            className="kpi-button"
            aria-label="Événement non documenté"
            value={unknownEvent}
            onChange={(e) => setUnknownEvent(e.target.value)}
          >
            {[...new Set(unknown.data?.map((m) => m.event_code) ?? [])].map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
        </label>
        <div className="max-h-72 overflow-auto grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          {[unknownEvent].map((ev) => (
            <fieldset key={ev} className="text-xs text-muted-foreground">
              <legend className="font-semibold">{ev}</legend>
              {unknown.data
                ?.filter((m) => m.event_code === ev)
                .map((m) => (
                  <label
                    key={m.code}
                    className="flex items-center gap-2 opacity-50"
                    title={m.reason}
                  >
                    <input type="checkbox" disabled aria-label={m.code} />
                    {m.code}
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
      </details>
      {error && <p role="alert">{toUserMessage(error)}</p>}
      {(metrics.isPending || captures.isPending || series.isFetching || events.isFetching) && (
        <p role="status">Chargement du chronogramme…</p>
      )}
      {captures.data?.length === 0 && <p>Aucune capture pour ces filtres.</p>}
      {!codes.length && <p>Sélectionnez une métrique.</p>}
      {data && (
        <>
          <p className="text-xs">
            Capture {data.capture_id} · origine {data.origin_ts} (seq {data.origin_seq}) ·{" "}
            {data.duration_s} s
          </p>
          <Plot
            key={data.capture_id}
            data={data}
            events={events.data}
            stacked={stacked}
            start={
              task ? events.data?.markers.find((m) => m.seq === task.seq_daa)?.t_rel_s : undefined
            }
            end={
              task ? events.data?.markers.find((m) => m.seq === task.seq_dcomp)?.t_rel_s : undefined
            }
          />
          <div className="text-xs">
            {data.series.map((s) => (
              <p key={s.code}>
                {s.label} : {s.n_returned} / {s.n_total} points · {s.sampling.method} · facteur{" "}
                {s.sampling.factor}
              </p>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Une seule capture. Valeurs au seq survolé ; N/D si aucune observation à ce seq. Aucun
            appariement ni interpolation.
          </p>
          <p className="text-[10px]">result_id : {data.result_id}</p>
          {info && (
            <Sheet open={info} onOpenChange={setInfo}>
              <SheetContent className="overflow-auto">
                <SheetHeader>
                  <SheetTitle>Infos et preuves — Chronogramme</SheetTitle>
                  <SheetDescription>
                    Sources, capture et provenance du résultat affiché.
                  </SheetDescription>
                </SheetHeader>
                <pre className="text-xs whitespace-pre-wrap">
                  {JSON.stringify(
                    {
                      decoder_version: data.decoder_version,
                      schema_version: data.schema_version,
                      decode_level: data.decode_level,
                      aggregation: data.aggregation,
                      result_id: data.result_id,
                      capture_id: data.capture_id,
                      time_policy: data.time_policy,
                      metrics: metrics.data,
                      events_result_id: events.data?.result_id,
                      markers: events.data?.markers,
                    },
                    null,
                    2,
                  )}
                </pre>
              </SheetContent>
            </Sheet>
          )}
        </>
      )}
    </section>
  );
});
