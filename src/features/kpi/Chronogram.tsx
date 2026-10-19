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
import { getMetrics, getMetricCaptures, getMetricSeries, getCaptureEvents } from "@/lib/api/client";
import type { ChronogramData, ChronogramEvents } from "@/lib/api/metrics";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { toUserMessage } from "@/lib/api/http";
const palette = [
  "#60a5fa",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#e879f9",
];
function metricColor(code: string) {
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
function Plot({ data, events }: { data: ChronogramData; events?: ChronogramEvents | undefined }) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<ECharts | null>(null);
  const [ready, setReady] = useState(false);
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
    const grids = [
      { left: 80, right: 170, top: 75, height: 280 },
      ...categories.map((_, i) => ({ left: 80, right: 170, top: 395 + i * 65, height: 42 })),
    ];
    const xAxis = grids.map((_, i) => ({
      type: "value" as const,
      gridIndex: i,
      min: 0,
      max: data.duration_s,
      name: i === 0 ? "Temps capture (s)" : "",
      nameLocation: "middle" as const,
      nameGap: 28,
      axisLabel: { color: "#cbd5e1" },
      splitLine: { lineStyle: { color: "#334155" } },
    }));
    const yAxis = [
      ...(units.length ? units : [""]).map((u, i) => ({
        type: "value" as const,
        gridIndex: 0,
        name: u,
        position: i === 0 ? ("left" as const) : ("right" as const),
        offset: i < 2 ? 0 : (i - 1) * 65,
        scale: true,
        axisLabel: { color: "#cbd5e1" },
        splitLine: { show: i === 0, lineStyle: { color: "#334155" } },
      })),
      ...categories.map((s, i) => ({
        type: "value" as const,
        gridIndex: i + 1,
        min: 0,
        max: 1,
        name: s.label,
        show: true,
        axisLabel: { show: false },
        splitLine: { show: false },
        axisTick: { show: false },
      })),
    ];
    const markers = (events?.markers ?? []).map((e) => ({
      name: e.label,
      xAxis: e.t_rel_s,
      label: {
        formatter: e.type === "task" ? e.label.split(" · ")[0] : e.type.toUpperCase(),
        rotate: 90,
        fontSize: 9,
        color: e.type === "task" ? "#fbbf24" : "#c4b5fd",
      },
      lineStyle: { color: e.type === "task" ? "#fbbf24" : "#a78bfa", opacity: 0.6 },
    }));
    const lines = numeric.map((s, i) => ({
      name: s.label,
      type: "line" as const,
      yAxisIndex: units.indexOf(s.unit),
      showSymbol: false,
      symbolSize: 5,
      connectNulls: false,
      lineStyle: { width: 1.5, color: metricColor(s.code) },
      itemStyle: { color: metricColor(s.code) },
      data: s.points.map((p) => ({ value: [p.t_rel_s, p.value], tooltipText: p.tooltip })),
      ...(i === 0 ? { markLine: { symbol: "none", silent: true, data: markers } } : {}),
    }));
    const bands = categories.map((s, i) => ({
      name: s.label,
      type: "line" as const,
      xAxisIndex: i + 1,
      yAxisIndex: (units.length || 1) + i,
      data: [],
      markArea: {
        silent: false,
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
        legend: { top: 5, textStyle: { color: "#cbd5e1" } },
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
        series: [...lines, ...bands],
      } as EChartsOption,
      true,
    );
  }, [ready, data, events]);
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
      <div
        ref={host}
        data-testid="chronogram-chart"
        style={{ height: 490 + data.series.filter((s) => s.kind === "categorical").length * 65 }}
      />
    </>
  );
}
export const Chronogram = forwardRef<
  { info: () => void; csv: () => void },
  { projectId: string; filters: KpiQueryFilters }
>(({ projectId, filters }, ref) => {
  const [selectedCapture, setCapture] = useState<string>(),
    [selectedCodes, setCodes] = useState<string[]>(["rsrp", "sinr", "thr_dl"]),
    [info, setInfo] = useState(false);
  const metrics = useQuery({
    queryKey: ["metrics", projectId],
    queryFn: ({ signal }) => getMetrics(projectId, signal),
  });
  const captures = useQuery({
    queryKey: ["metric-captures", projectId, filters],
    queryFn: ({ signal }) => getMetricCaptures(projectId, filters, signal),
  });
  const cap =
    captures.data?.find((c) => c.capture_id === selectedCapture)?.capture_id ??
    captures.data?.[0]?.capture_id;
  const codes = selectedCodes.filter((code) => metrics.data?.some((m) => m.code === code));
  const series = useQuery({
    queryKey: ["metric-series", projectId, cap, codes],
    queryFn: ({ signal }) => getMetricSeries(projectId, cap!, codes, signal),
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
  const error = metrics.error ?? captures.error ?? series.error ?? events.error;
  const units = [...new Set(metrics.data?.map((m) => m.unit) ?? [])];
  return (
    <section className="p-4 space-y-3" data-testid="chronogram">
      <div className="flex flex-wrap items-center gap-3">
        <label>
          Capture{" "}
          <select
            className="kpi-button"
            aria-label="Capture du chronogramme"
            value={cap ?? ""}
            onChange={(e) => setCapture(e.target.value)}
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
      <div className="flex flex-wrap gap-5">
        {units.map((unit) => (
          <fieldset key={unit} className="text-xs space-y-1">
            <legend className="font-semibold mb-1">{unit}</legend>
            {metrics.data
              ?.filter((m) => m.unit === unit)
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
                  {m.label}
                </label>
              ))}
          </fieldset>
        ))}
      </div>
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
          <Plot key={data.capture_id} data={data} events={events.data} />
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
