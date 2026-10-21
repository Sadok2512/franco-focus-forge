import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ECharts, EChartsOption, CustomSeriesRenderItem } from "echarts";
import { getSignaling, getMetricSeries } from "@/lib/api/client";
import type { RfEvent } from "@/lib/api/signaling";
import { rfColors, rfProtocolColors } from "@/theme/rf-timeline";
import { TimeCursor } from "./TimeCursor";
import { activeIntervals } from "./cursor";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, Maximize } from "lucide-react";

// Fixed lane order matching the reference layout: UE state bands on top,
// then network events, task lanes, mobility, and one combined RF grid.
const lanes = ["uestate", "network", "dl", "ul", "vonr", "mobility"] as const;
type Lane = (typeof lanes)[number];
const laneOf = (track: string | undefined): Lane => {
  if (track === "lte" || track === "nsa" || track === "sa") return "uestate";
  if (track === "volte") return "vonr";
  if (track === "dl" || track === "ul" || track === "mobility") return track;
  return "network";
};
const codes = ["cell_rsrp", "cell_rsrq", "ci_rs_snr"];
const protocols = ["RRC LTE", "RRC NR", "NAS", "Nemo", "MAC-RACH", "Procedures"];
const severityLegend = [
  { key: "info", color: "#1769E0" },
  { key: "success", color: "#16A34A" },
  { key: "warning", color: "#F97316" },
  { key: "error", color: "#DC2626" },
  { key: "event", color: "#9333EA" },
];
const escape = (v: unknown) =>
  String(v ?? "—").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function RfTimeline({
  projectId,
  captureId,
  selectedTime,
  onSelect,
  onTime,
  selectedEventId,
  onRange,
  technology,
  direction,
  search,
  allowedProtocols,
}: {
  projectId: string;
  captureId: string;
  selectedTime: number | null;
  onSelect: (e: RfEvent, seq?: number) => void;
  onTime: (time: number | null) => void;
  selectedEventId: string | null;
  onRange: (range: [number, number] | undefined) => void;
  technology: string;
  direction: string;
  search: string;
  allowedProtocols: string[];
}) {
  const { t, i18n } = useTranslation();
  const [layers, setLayers] = useState(protocols);
  const [measures, setMeasures] = useState(codes);
  const [linked, setLinked] = useState<RfEvent>();
  const [ready, setReady] = useState(0);
  const [windowSeq, setWindowSeq] = useState<{ from_seq: number; to_seq: number }>();
  const [zoom, setZoom] = useState<[number, number]>([0, 100]);
  const host = useRef<HTMLDivElement>(null),
    root = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | undefined>(undefined);
  const callbacks = useRef({ onSelect, onRange });
  callbacks.current = { onSelect, onRange };
  const events = useQuery({
    queryKey: ["signaling-rf", projectId, captureId, technology, direction, search],
    queryFn: ({ signal }) =>
      getSignaling(
        projectId,
        "events",
        {
          capture_id: captureId,
          view: "rf",
          technology: technology || undefined,
          direction: direction || undefined,
          q: search || undefined,
        },
        signal,
      ),
    staleTime: 60000,
  });
  const radio = useQuery({
    queryKey: ["signaling-rf-radio", projectId, captureId],
    queryFn: ({ signal }) => getMetricSeries(projectId, captureId, codes, signal),
    staleTime: 60000,
  });
  const detailed = useQuery({
    queryKey: ["signaling-rf-radio-window", projectId, captureId, windowSeq],
    enabled: !!windowSeq,
    queryFn: ({ signal }) => getMetricSeries(projectId, captureId, codes, signal, windowSeq),
    staleTime: 60000,
  });
  // Zoom narrows the server's seq window only when the overview was sampled.
  // Surrounding observed seqs bound the request; no measurement/time is inferred.
  useEffect(() => {
    const data = radio.data;
    if (!data || !data.series.some((s) => s.sampling.factor > 1)) return;
    if (zoom[0] === 0 && zoom[1] === 100) {
      setWindowSeq(undefined);
      return;
    }
    const timer = window.setTimeout(() => {
      const points = data.series.flatMap((s) => s.points).sort((a, b) => a.seq - b.seq);
      const lo = (data.duration_s * zoom[0]) / 100,
        hi = (data.duration_s * zoom[1]) / 100;
      const first = points.filter((p) => p.t_rel_s <= lo).at(-1) ?? points[0];
      const last = points.find((p) => p.t_rel_s >= hi) ?? points.at(-1);
      if (first && last) setWindowSeq({ from_seq: first.seq, to_seq: last.seq });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [zoom, radio.data]);
  const displayed = useMemo(
    () =>
      events.data?.events.filter(
        (e) =>
          layers.includes(e.attrs.protocol ?? "") &&
          (e.attrs.protocol === "Procedures" ||
            allowedProtocols.includes(
              e.attrs.protocol === "Nemo" ? "Événements Nemo" : (e.attrs.protocol ?? ""),
            )) &&
          e.t_rel_s !== null,
      ) ?? [],
    [events.data, layers, allowedProtocols],
  );
  const series = (detailed.data ?? radio.data)?.series;
  const duration =
    radio.data?.duration_s ??
    Math.max(0, ...displayed.flatMap((e) => [e.t_rel_s ?? 0, e.t_rel_end_s ?? 0]));
  const cursorSeries = useMemo(
    () =>
      codes.map((code) => ({
        code,
        label: t(`rfTimeline.${code}`),
        unit: code === "cell_rsrp" ? "dBm" : "dB",
        points:
          measures.includes(code) && technology !== "NR"
            ? (series ?? [])
                .filter((s) => s.code === code)
                .flatMap((s) => s.points)
                .filter((p): p is typeof p & { value: number } => typeof p.value === "number")
                .sort((a, b) => a.t_rel_s - b.t_rel_s || a.seq - b.seq)
            : [],
      })),
    [series, measures, technology, t],
  );
  const current = useRef({ displayed, series, duration });
  current.current = { displayed, series, duration };
  useEffect(() => {
    setWindowSeq(undefined);
    setZoom([0, 100]);
    setLinked(undefined);
  }, [captureId]);
  useEffect(() => {
    let stopped = false;
    let observer: ResizeObserver | undefined;
    void import("echarts").then((e) => {
      if (stopped || !host.current) return;
      const c = e.init(host.current);
      chart.current = c;
      setReady((n) => n + 1);
      observer = new ResizeObserver(() => c.resize());
      observer.observe(host.current);
      c.on("click", (ev: unknown) => {
        const data = (ev as { data?: { event?: RfEvent } }).data;
        if (data?.event) {
          setLinked(data.event);
          callbacks.current.onSelect(data.event);
        }
      });
      c.on("datazoom", () => {
        const option = c.getOption() as { dataZoom: { start: number; end: number }[] };
        const z = option.dataZoom[0];
        if (z) setZoom([z.start, z.end]);
      });
      c.on("brushEnd", (ev: unknown) => {
        const r = (ev as { areas?: { coordRange: number[] }[] }).areas?.[0]?.coordRange;
        if (r?.length === 2) {
          callbacks.current.onRange([r[0]!, r[1]!]);
          const points =
            current.current.series
              ?.flatMap((s) => s.points)
              .filter((p) => p.t_rel_s >= r[0]! && p.t_rel_s <= r[1]!) ?? [];
          if (points.length)
            setWindowSeq({
              from_seq: Math.min(...points.map((p) => p.seq)),
              to_seq: Math.max(...points.map((p) => p.seq)),
            });
        } else {
          callbacks.current.onRange(undefined);
          setWindowSeq(undefined);
        }
      });
    });
    return () => {
      stopped = true;
      observer?.disconnect();
      chart.current?.dispose();
      chart.current = undefined;
    };
  }, []);
  // Highlighting changes only item styles; the time axis and zoom are untouched.
  useEffect(() => {
    const c = chart.current;
    if (!c || !c.getOption()?.["xAxis"]) return;
    const active = new Set(
      selectedTime === null ? [] : activeIntervals(displayed, selectedTime).map((e) => e.id),
    );
    c.setOption({
      series: [
        {
          id: "events",
          data: displayed.map((e) => ({
            value: [lanes.indexOf(laneOf(e.attrs.track)), e.t_rel_s, e.t_rel_end_s ?? e.t_rel_s],
            event: e,
            itemStyle: { opacity: e.id === selectedEventId || active.has(e.id) ? 1 : 0.65 },
          })),
        },
      ],
    });
  }, [selectedTime, selectedEventId, displayed, ready]);
  const showLabels = zoom[1] - zoom[0] <= 30;
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const fmtT = (v: number) =>
      v.toLocaleString(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    const renderItem: CustomSeriesRenderItem = (params, api) => {
      const lane = Number(api.value(0)),
        start = api.coord([api.value(1), lane]),
        end = api.coord([api.value(2), lane]);
      const item = displayed[params.dataIndex];
      if (!item) return;
      const track = item.attrs.track ?? "";
      const isBand = track === "lte" || track === "nsa" || track === "sa";
      const color =
        item.attrs.status === "FAILURE"
          ? rfColors["failure"]!
          : isBand
            ? (rfColors[track] ?? rfColors["unknown"]!)
            : item.attrs.track === "network"
              ? (rfProtocolColors[item.attrs.protocol ?? ""] ?? rfColors["unknown"]!)
              : (rfColors[item.attrs.track ?? "unknown"] ?? rfColors["unknown"]!);
      const width = Math.max(3, end[0]! - start[0]!);
      const opacity =
        item.attrs.evidence_status === "PARTIAL" ? 0.45 : (api.style().opacity ?? 0.9);
      const children: Record<string, unknown>[] = [];
      if (isBand) {
        // UE state band: filled rounded rect with the state label inside.
        children.push({
          type: "rect",
          shape: { x: start[0]!, y: start[1]! - 11, width, height: 22, r: 4 },
          style: { fill: color, opacity },
        });
        if (width > 70)
          children.push({
            type: "text",
            style: {
              x: start[0]! + width / 2,
              y: start[1]!,
              text: item.label,
              fill: "#ffffff",
              fontSize: 10,
              fontWeight: 600,
              align: "center",
              verticalAlign: "middle",
            },
          } as never);
      } else if (item.t_rel_end_s !== null && item.t_rel_end_s > (item.t_rel_s ?? 0)) {
        // Task bar with Start / End captions when there is room.
        children.push({
          type: "rect",
          shape: { x: start[0]!, y: start[1]! - 7, width, height: 14, r: 7 },
          style: { fill: color, opacity },
        });
        if (width > 90)
          children.push({
            type: "text",
            style: {
              x: start[0]! + width / 2,
              y: start[1]!,
              text: item.label,
              fill: "#ffffff",
              fontSize: 9,
              align: "center",
              verticalAlign: "middle",
            },
          } as never);
        if (showLabels && width > 40) {
          children.push({
            type: "text",
            style: {
              x: start[0]!,
              y: start[1]! - 12,
              text: `Start\n${fmtT(item.t_rel_s ?? 0)} s`,
              fill: "#475569",
              fontSize: 8,
              align: "left",
              verticalAlign: "bottom",
            },
          } as never);
          children.push({
            type: "text",
            style: {
              x: end[0]!,
              y: start[1]! - 12,
              text: `End\n${fmtT(item.t_rel_end_s)} s`,
              fill: "#475569",
              fontSize: 8,
              align: "right",
              verticalAlign: "bottom",
            },
          } as never);
        }
      } else {
        // Point event: icon dot, with label + timestamp when zoomed in.
        children.push({
          type: "circle",
          shape: { cx: start[0]!, cy: start[1]!, r: 6 },
          style: { fill: color, stroke: "#ffffff", lineWidth: 1.5, opacity },
        });
        if (showLabels)
          children.push({
            type: "text",
            style: {
              x: start[0]!,
              y: start[1]! + 12,
              text: `${item.label}\n${fmtT(item.t_rel_s ?? 0)} s`,
              fill: "#475569",
              fontSize: 8,
              align: "center",
              verticalAlign: "top",
            },
          } as never);
      }
      return { type: "group", children } as unknown as ReturnType<
        NonNullable<CustomSeriesRenderItem>
      >;
    };
    const xAxes = [0, 1].map((i) => ({
      type: "value" as const,
      gridIndex: i,
      min: 0,
      ...(duration !== undefined ? { max: duration } : {}),
      axisLabel: {
        color: "#94a3b8",
        formatter: (v: number) => `${v.toLocaleString(i18n.language)} s`,
      },
      position: "top" as const,
      show: i === 0,
      name: "",
    }));
    const metricSeries = codes.map((code, i) => ({
      id: code,
      name: t(`rfTimeline.${code}`),
      type: "line" as const,
      xAxisIndex: 1,
      yAxisIndex: 1,
      showSymbol: false,
      lineStyle: { width: 1.6, color: rfColors[code]! },
      itemStyle: { color: rfColors[code]! },
      z: 2 + i,
      data:
        measures.includes(code) && technology !== "NR"
          ? (series?.find((s) => s.code === code)?.points ?? []).map((p) => ({
              value: [p.t_rel_s, p.value],
              seq: p.seq,
              source: code,
            }))
          : [],
    }));
    const options: EChartsOption = {
      animation: false,
      backgroundColor: "transparent",
      grid: [
        { top: 30, height: 216, left: 112, right: 24 },
        { top: 292, height: 138, left: 112, right: 24 },
      ],
      legend: {
        top: 300,
        left: 2,
        orient: "vertical",
        icon: "rect",
        itemWidth: 12,
        itemHeight: 3,
        itemGap: 8,
        textStyle: { fontSize: 10, color: "#475569" },
        data: codes.map((code) => t(`rfTimeline.${code}`)),
      },
      xAxis: xAxes,
      yAxis: [
        {
          type: "category",
          inverse: true,
          data: lanes.map((k) => t(`rfTimeline.${k}`)),
          axisLabel: { color: "#94a3b8", fontSize: 11 },
          axisTick: { show: false },
          axisLine: { show: false },
        },
        {
          type: "value",
          gridIndex: 1,
          scale: true,
          name: t("rfTimeline.rfMetrics"),
          nameTextStyle: { color: "#94a3b8", fontSize: 10 },
          axisLabel: { color: "#94a3b8", fontSize: 10 },
          splitLine: { lineStyle: { color: "#334155", opacity: 0.25 } },
        },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1], filterMode: "none", zoomOnMouseWheel: "ctrl" },
        { type: "slider", xAxisIndex: [0, 1], filterMode: "none", bottom: 0, height: 18 },
      ],
      brush: { xAxisIndex: [0, 1], brushType: "lineX", toolbox: ["lineX", "clear"] },
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (p: unknown) => {
          const d = (
            p as { data: { event?: RfEvent; value?: unknown[]; seq?: number; source?: string } }
          ).data;
          if (d.event) {
            const e = d.event;
            const header = `<b>${escape(e.label)}</b><br/>${escape(e.t_rel_s)} s · #${e.seq}<br/>${escape(e.attrs.technology)} · ${escape(e.attrs.status)}<br/>${escape(e.attrs.evidence_status)} · ${escape(e.attrs.source)}<br/>${escape((e.attrs.source_seqs ?? []).join(", "))}<br/>${e.duration_ms === null ? "" : escape(e.duration_ms) + " ms"}`;
            const fields = ["hoa_pci", "hoa_att_pci", "hoa_ch_number", "hoa_att_ch", "cause"]
              .filter((k) => e.attrs[k] != null)
              .map((k) => `${escape(k)}: ${escape(e.attrs[k])}`)
              .join("<br/>");
            return header + "<br/>" + fields;
          }
          return `${escape(d.source)}<br/>${escape(d.value?.[0])} s · #${d.seq}<br/>${escape(d.value?.[1])}`;
        },
      },
      series: [
        {
          id: "events",
          type: "custom",
          renderItem,
          encode: { x: [1, 2], y: 0 },
          clip: true,
          data: displayed.map((e) => ({
            value: [lanes.indexOf(laneOf(e.attrs.track)), e.t_rel_s, e.t_rel_end_s ?? e.t_rel_s],
            event: e,
          })),
        },
        ...metricSeries,
      ],
    };
    c.setOption(options);
  }, [
    ready,
    displayed,
    series,
    duration,
    measures,
    t,
    technology,
    projectId,
    captureId,
    i18n.language,
    showLabels,
  ]);
  const zoomBy = (factor: number) => {
    const center = (zoom[0] + zoom[1]) / 2,
      half = ((zoom[1] - zoom[0]) * factor) / 2;
    chart.current?.dispatchAction({
      type: "dataZoom",
      start: Math.max(0, center - half),
      end: Math.min(100, center + half),
    });
  };
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col bg-card" data-testid="rf-timeline">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <h3 className="mr-1 text-sm font-semibold">{t("rfTimeline.title")}</h3>
        <span className="flex items-center gap-2" aria-hidden="true">
          {severityLegend.map((s) => (
            <span key={s.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              {t(`rfTimeline.legend.${s.key}`)}
            </span>
          ))}
        </span>
        <details>
          <summary className="kpi-button">{t("rfTimeline.events")}</summary>
          <div className="flex flex-wrap gap-2 p-2">
            {protocols.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={layers.includes(p)}
                  onChange={() =>
                    setLayers((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]))
                  }
                />
                <span style={{ color: rfProtocolColors[p] }}>{t(`rfTimeline.layers.${p}`)}</span>
              </label>
            ))}
          </div>
        </details>
        <details>
          <summary className="kpi-button">{t("rfTimeline.measures")}</summary>
          <div className="flex flex-wrap gap-2 p-2">
            {codes.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={measures.includes(p)}
                  onChange={() =>
                    setMeasures((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]))
                  }
                />
                {t(`rfTimeline.${p}`)}
              </label>
            ))}
          </div>
        </details>
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="kpi-button"
            onClick={() => zoomBy(0.5)}
            aria-label={t("rfTimeline.zoomIn")}
          >
            <ZoomIn />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="kpi-button"
            onClick={() => zoomBy(2)}
            aria-label={t("rfTimeline.zoomOut")}
          >
            <ZoomOut />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="kpi-button"
            aria-label={t("rfTimeline.reset")}
            title={t("rfTimeline.reset")}
            onClick={() => {
              chart.current?.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
              setWindowSeq(undefined);
              callbacks.current.onRange(undefined);
            }}
          >
            <RotateCcw />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="kpi-button"
            aria-label={t("rfTimeline.fullscreen")}
            title={t("rfTimeline.fullscreen")}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void root.current?.requestFullscreen();
            }}
          >
            <Maximize />
          </Button>
        </span>
      </div>
      {(events.isPending || radio.isPending) && <p role="status">{t("rfTimeline.loading")}</p>}
      {[events, radio, detailed]
        .filter((q) => q.isError)
        .map((q, i) => (
          <p key={i} role="alert">
            {String(q.error.message)}
          </p>
        ))}
      {!events.isPending &&
        !events.isError &&
        !displayed.some((e) => laneOf(e.attrs.track) === "uestate") && (
          <p className="text-[10px] text-muted-foreground" data-testid="rf-uestate-empty">
            {t("rfTimeline.ueStateEmpty")}
          </p>
        )}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ minWidth: 320 }}>
          <div
            ref={host}
            style={{ height: 470, minWidth: 320 }}
            data-testid="rf-chart"
            data-selected-time={selectedTime ?? undefined}
            data-zoom={zoom.join(",")}
          />
          <TimeCursor
            chart={chart.current}
            host={host}
            selectedTime={selectedTime}
            eventId={selectedEventId}
            events={displayed}
            series={cursorSeries}
            zoom={zoom}
            duration={duration}
            onTime={onTime}
            onMessage={onSelect}
          />
        </div>
      </div>
      {linked && (
        <div className="flex flex-wrap gap-2 text-xs" data-testid="rf-evidence">
          {t("rfTimeline.evidence")}:{" "}
          {linked.linked_seqs.map((s) => (
            <Button
              variant="outline"
              size="sm"
              key={s}
              className="kpi-button"
              onClick={() => onSelect(linked, s)}
            >
              #{s}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
