import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ECharts, EChartsOption, CustomSeriesRenderItem } from "echarts";
import { getSignaling, getMetricSeries } from "@/lib/api/client";
import type { RfEvent } from "@/lib/api/signaling";
import { rfColors, rfProtocolColors } from "@/theme/rf-timeline";
import { TimeCursor } from "./TimeCursor";
import { activeIntervals } from "./cursor";
import { isAllowedNetworkEvent } from "./network-events";
import { clampWindow, FULL_CAPTURE_S, useTimeWindow, type TimeWindow } from "./time-window";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, Maximize, Crosshair } from "lucide-react";
import { provenStates, stateTrack, stateLabelKey } from "./state-evidence";
import { WindowSelector } from "./WindowSelector";

// Fixed lane order matching the reference layout: UE state bands on top,
// then network events, task lanes, mobility, and one combined RF grid.
const laneOrder = [
  "uestate",
  "rrcstate",
  "network",
  "dl",
  "ul",
  "volte",
  "vonr",
  "ping",
  "sms",
  "mobility",
] as const;
type Lane = (typeof laneOrder)[number];
const laneOf = (track: string | undefined): Lane => {
  if (track?.toUpperCase() === "RRC_STATE") return "rrcstate";
  if (track?.toUpperCase() === "UE_STATE") return "uestate";
  if (track === "lte" || track === "nsa" || track === "sa") return "uestate";
  if (
    track === "dl" ||
    track === "ul" ||
    track === "volte" ||
    track === "vonr" ||
    track === "ping" ||
    track === "sms" ||
    track === "mobility"
  )
    return track;
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
  timeWindow,
  onWindow,
  stateTracksV2 = false,
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
  timeWindow?: TimeWindow;
  onWindow?: (window: TimeWindow) => void;
  stateTracksV2?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [layers, setLayers] = useState(protocols);
  const [measures, setMeasures] = useState(codes);
  const [linked, setLinked] = useState<RfEvent>();
  const [ready, setReady] = useState(0);
  const [, redrawCursor] = useState(0);
  const [windowSeq, setWindowSeq] = useState<{ from_seq: number; to_seq: number }>();

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
  const eligibleEvents = useMemo(
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
  const states = useMemo(
    () => (stateTracksV2 ? provenStates(events.data?.events ?? [], captureId) : []),
    [stateTracksV2, events.data, captureId],
  );
  const displayed = useMemo(() => {
    const source = eligibleEvents.filter(
      (event) => laneOf(event.attrs.track) !== "network" || isAllowedNetworkEvent(event),
    );
    if (!stateTracksV2) return source;
    const stateEvents = states
      .filter(
        (state) =>
          !technology ||
          (technology === "LTE" ? state.technology === "LTE" : state.technology !== "LTE"),
      )
      .map((state) => ({
        ...state.event,
        label: t(stateLabelKey(state)),
        attrs: {
          ...state.event.attrs,
          track: state.track === "UE_STATE" ? "ue_state" : "rrc_state",
        },
      }));
    return [...source.filter((event) => stateTrack(event) === null), ...stateEvents];
  }, [eligibleEvents, stateTracksV2, states, technology, t]);
  const series = (detailed.data ?? radio.data)?.series;
  const lanes = useMemo(
    () =>
      laneOrder.filter(
        (lane) =>
          lane === "uestate" ||
          (stateTracksV2 && lane === "rrcstate") ||
          lane === "network" ||
          displayed.some((event) => laneOf(event.attrs.track) === lane),
      ),
    [displayed, stateTracksV2],
  );
  const duration =
    radio.data?.duration_s ??
    Math.max(0, ...eligibleEvents.flatMap((e) => [e.t_rel_s ?? 0, e.t_rel_end_s ?? 0]));
  const localWindow = useTimeWindow(captureId, duration, FULL_CAPTURE_S);
  const visibleWindow = timeWindow ?? localWindow.window;
  const changeWindow = onWindow ?? localWindow.setWindow;
  const zoom: [number, number] =
    duration > 0
      ? [(visibleWindow[0] / duration) * 100, (visibleWindow[1] / duration) * 100]
      : [0, 100];
  const windowCallbacks = useRef({ changeWindow, duration });
  windowCallbacks.current = { changeWindow, duration };
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
        if (z) {
          const { changeWindow, duration } = windowCallbacks.current;
          changeWindow([(duration * z.start) / 100, (duration * z.end) / 100]);
        }
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
  useEffect(() => {
    const c = chart.current;
    if (!c || !duration || !c.getOption()?.["xAxis"]) return;
    c.dispatchAction(
      { type: "dataZoom", startValue: visibleWindow[0], endValue: visibleWindow[1] },
      { silent: true },
    );
    redrawCursor((revision) => revision + 1);
  }, [visibleWindow[0], visibleWindow[1], duration, ready]);
  const showLabels = visibleWindow[1] - visibleWindow[0] <= 120;
  const trackHeight = stateTracksV2 ? lanes.length * 34 : 216;
  const rfTop = stateTracksV2 ? 30 + trackHeight + 22 : 292;
  const chartHeight = stateTracksV2 ? rfTop + 3 * 60 + 16 : 470;
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
      const isBand =
        track === "lte" ||
        track === "nsa" ||
        track === "sa" ||
        (stateTracksV2 && (track === "ue_state" || track === "rrc_state"));
      const proof = states.find((state) => state.event.id === item.id);
      const stateRole =
        proof?.state === "IDLE"
          ? "idle"
          : proof?.state === "CONNECTED"
            ? "connected"
            : proof?.state === "LTE"
              ? proof.componentCarriers === 4
                ? "lte-ca"
                : "lte"
              : proof?.componentCarriers === 2
                ? "nr-ca"
                : "nr";
      const stateColor = getComputedStyle(document.documentElement)
        .getPropertyValue(`--signaling-state-${stateRole}`)
        .trim();
      const color = proof
        ? stateColor
        : item.attrs.status === "FAILURE"
          ? rfColors["failure"]!
          : isBand
            ? (rfColors[track] ?? rfColors["unknown"]!)
            : item.attrs.track === "network"
              ? (rfProtocolColors[item.attrs.protocol ?? ""] ?? rfColors["unknown"]!)
              : (rfColors[item.attrs.track ?? "unknown"] ?? rfColors["unknown"]!);
      const coordSys = params.coordSys as unknown as { x: number; width: number };
      if (
        stateTracksV2 &&
        ((end[0] ?? 0) < coordSys.x || (start[0] ?? 0) > coordSys.x + coordSys.width)
      )
        return;
      const left = stateTracksV2 ? Math.max(coordSys.x, start[0] ?? 0) : (start[0] ?? 0);
      const right = stateTracksV2
        ? Math.min(coordSys.x + coordSys.width, end[0] ?? left)
        : (end[0] ?? left);
      const width = Math.max(3, right - left);
      const opacity =
        item.attrs.evidence_status === "PARTIAL" ? 0.45 : (api.style().opacity ?? 0.9);
      const children: Record<string, unknown>[] = [];
      if (isBand) {
        const y = (start[1] ?? 0) + (stateTracksV2 ? (proof?.technology === "LTE" ? -8 : 8) : 0);
        // UE state band: filled rounded rect with the state label inside.
        children.push({
          type: "rect",
          shape: {
            x: left,
            y: y - (stateTracksV2 ? 7 : 11),
            width,
            height: stateTracksV2 ? 14 : 22,
            r: 4,
          },
          style: { fill: color, opacity },
        });
        if (width > 70)
          children.push({
            type: "text",
            style: {
              x: left + width / 2,
              y,
              text: item.label,
              fill: stateTracksV2
                ? getComputedStyle(document.documentElement)
                    .getPropertyValue("--signaling-state-text")
                    .trim()
                : "#ffffff",
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
    // V2: one RF sub-grid per metric, each with its own Y scale, sharing the X axis.
    const rfGrids = stateTracksV2 ? codes.length : 1;
    const subH = 52;
    const xAxes = Array.from({ length: 1 + rfGrids }, (_, i) => ({
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
      xAxisIndex: stateTracksV2 ? 1 + i : 1,
      yAxisIndex: stateTracksV2 ? 1 + i : 1,
      showSymbol: stateTracksV2,
      symbolSize: 2,
      connectNulls: false,
      lineStyle: { width: stateTracksV2 ? 1.2 : 1.6, color: rfColors[code]! },
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
        { top: 30, height: trackHeight, left: 112, right: 24 },
        ...(stateTracksV2
          ? codes.map((_, i) => ({
              top: rfTop + i * (subH + 8),
              height: subH,
              left: 112,
              right: 24,
            }))
          : [{ top: rfTop, height: 138, left: 112, right: 24 }]),
      ],
      legend: {
        show: !stateTracksV2,
        top: rfTop + 8,
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
          data: lanes.map((k) =>
            t(
              stateTracksV2 && (k === "uestate" || k === "rrcstate")
                ? `signalingV2.${k === "uestate" ? "ueState" : "rrcState"}`
                : `rfTimeline.${k}`,
            ),
          ),
          axisLabel: { color: "#94a3b8", fontSize: 11 },
          axisTick: { show: false },
          axisLine: { show: false },
        },
        ...(stateTracksV2
          ? codes.map((code, i) => ({
              type: "value" as const,
              gridIndex: 1 + i,
              scale: true,
              splitNumber: 2,
              name: t(`rfTimeline.${code}`),
              nameLocation: "middle" as const,
              nameRotate: 0,
              nameGap: 46,
              nameTextStyle: { color: rfColors[code]!, fontSize: 10, align: "right" as const },
              axisLabel: { color: "#94a3b8", fontSize: 9 },
              splitLine: { lineStyle: { color: "#334155", opacity: 0.15 } },
            }))
          : [
              {
                type: "value" as const,
                gridIndex: 1,
                scale: true,
                name: t("rfTimeline.rfMetrics"),
                nameTextStyle: { color: "#94a3b8", fontSize: 10 },
                axisLabel: { color: "#94a3b8", fontSize: 10 },
                splitLine: { lineStyle: { color: "#334155", opacity: 0.25 } },
              },
            ]),
      ],
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: xAxes.map((_, i) => i),
          filterMode: "none",
          zoomOnMouseWheel: "ctrl",
          startValue: visibleWindow[0],
          endValue: visibleWindow[1],
        },
        {
          type: "slider",
          show: false,
          xAxisIndex: xAxes.map((_, i) => i),
          filterMode: "none",
          startValue: visibleWindow[0],
          endValue: visibleWindow[1],
        },
      ],
      brush: { xAxisIndex: xAxes.map((_, i) => i), brushType: "lineX", toolbox: ["lineX", "clear"] },
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (p: unknown) => {
          const d = (
            p as { data: { event?: RfEvent; value?: unknown[]; seq?: number; source?: string } }
          ).data;
          if (d.event) {
            const e = d.event;
            const proof = states.find((state) => state.event.id === e.id);
            if (proof)
              return `<b>${escape(e.label)}</b><br/>${fmtT(proof.startS)} → ${fmtT(proof.endS)} s<br/>${escape(t("signalingV2.duration"))}: ${fmtT(proof.endS - proof.startS)} s<br/>${escape(proof.technology)} · ${escape(t("signalingV2.session"))}: ${escape(proof.sessionId)}<br/>${proof.componentCarriers === null ? "" : `${proof.componentCarriers} ${escape(t(`signalingV2.${proof.carrierStatus}`))}<br/>`}${escape(t("signalingV2.proof"))}: ${escape(proof.evidenceSeqs.join(", "))}`;
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
        ...(stateTracksV2
          ? [
              {
                id: "state-background",
                type: "custom" as const,
                silent: true,
                z: 0,
                renderItem: ((_params, api) => {
                  const lane = Number(api.value(0));
                  const point = api.coord([0, lane]);
                  const area = _params.coordSys as unknown as { x: number; width: number };
                  const muted = getComputedStyle(document.documentElement)
                    .getPropertyValue("--muted")
                    .trim();
                  const text = getComputedStyle(document.documentElement)
                    .getPropertyValue("--muted-foreground")
                    .trim();
                  return {
                    type: "group",
                    children: [
                      {
                        type: "rect",
                        shape: {
                          x: area.x,
                          y: (point[1] ?? 0) - 16,
                          width: area.width,
                          height: 32,
                        },
                        style: { fill: muted },
                      },
                      ...[-8, 8]
                        .filter(
                          (offset) =>
                            !states.some(
                              (state) =>
                                state.track === (lane === 0 ? "UE_STATE" : "RRC_STATE") &&
                                (state.technology === "LTE") === offset < 0 &&
                                state.startS <= visibleWindow[0] &&
                                state.endS > visibleWindow[0],
                            ),
                        )
                        .map((offset) => ({
                          type: "text",
                          style: {
                            x: area.x + 6,
                            y: (point[1] ?? 0) + offset,
                            text: `${offset < 0 ? "LTE" : "NR"} · ${t("signalingV2.unknown")}`,
                            fontSize: 9,
                            verticalAlign: "middle",
                            fill: text,
                          },
                        })),
                    ],
                  };
                }) as CustomSeriesRenderItem,
                data: [0, 1].map((lane) => [lane, 0]),
                encode: { y: 0 },
                clip: true,
              },
            ]
          : []),
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
    lanes,
    stateTracksV2,
    states,
    trackHeight,
    rfTop,
  ]);
  const zoomBy = (factor: number) => {
    const width = Math.min(duration, Math.max(0.1, (visibleWindow[1] - visibleWindow[0]) * factor));
    changeWindow(clampWindow(duration, (visibleWindow[0] + visibleWindow[1] - width) / 2, width));
  };
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col bg-card" data-testid="rf-timeline">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <h3 className="mr-1 text-sm font-semibold">{t("rfTimeline.title")}</h3>
        <span className="flex items-center gap-2" aria-hidden="true">
          {severityLegend.map((s) => (
            <span key={s.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
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
            title={t("rfTimeline.showCursor")}
            aria-label={t("rfTimeline.showCursor")}
            data-testid="show-time-cursor"
            onClick={() => onTime((visibleWindow[0] + visibleWindow[1]) / 2)}
          >
            <Crosshair />
          </Button>
          {stateTracksV2 && (
            <WindowSelector duration={duration} window={visibleWindow} onWindow={changeWindow} />
          )}
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
              changeWindow(clampWindow(duration, 0, stateTracksV2 ? 30 : FULL_CAPTURE_S));
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
      {!stateTracksV2 &&
        !events.isPending &&
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
            style={{ height: chartHeight, minWidth: 320 }}
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
            stateTracksV2={stateTracksV2}
            captureId={captureId}
          />
        </div>
      </div>
      {stateTracksV2 && (
        <p
          className="shrink-0 text-[10px] text-muted-foreground"
          data-testid="state-evidence-status"
        >
          {t("signalingV2.unavailable")}
        </p>
      )}
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
