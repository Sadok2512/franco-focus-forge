import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ECharts, EChartsOption, CustomSeriesRenderItem } from "echarts";
import { getSignaling, getMetricSeries } from "@/lib/api/client";
import { type RfEvent } from "@/lib/api/signaling";
import { rfColors, rfProtocolColors } from "@/theme/rf-timeline";
import { TimeCursor } from "./TimeCursor";
import { activeIntervals } from "./cursor";
import { isAllowedNetworkEvent } from "./network-events";
import { DEFAULT_WINDOW_S, FULL_CAPTURE_S, useTimeWindow, type TimeWindow } from "./time-window";
import { provenStates, stateTrack } from "./state-evidence";
import {
  statePresentation,
  stateBandGeometry,
  stateLaneLayout,
  stateLaneTitle,
  rrcStateLaneLabel,
} from "./state-presentation";
import { rrcStateSegments, type RrcStateSegment } from "./rrc-state-segments";
import { eventIcon, iconImage } from "./event-icons";
import { eventTrack } from "./event-track";
import { TimeNavigator } from "./TimeNavigator";
import { clampNameTagX, nearestNameTag, type NameTag } from "./name-tag";
import { mergeTimelineEvents, shouldLoadTimelineDetail } from "./timeline-loading";
import { MAP_METRIC_MIME, readMapMetric } from "@/features/kpi/map-metric-drop";
import "./signaling.css";

// Fixed lane order: RRC state on top (user request), then UE state,
// then network events, task lanes, mobility, and one combined RF grid.
const laneOrder = [
  "rrcstate",
  "uestate",
  "network",
  "dl",
  "ul",
  "volte",
  "vonr",
  "voice",
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
const laneFor = (event: Pick<RfEvent, "attrs" | "lane">, compactKpi = false): Lane => {
  const lane = laneOf(eventTrack(event));
  if (!compactKpi) return lane;
  if (lane === "volte" || lane === "vonr") return "voice";
  if (lane === "rrcstate" || lane === "uestate" || lane === "dl" || lane === "ul") return lane;
  return "network";
};
/** Presentation allowlist for the compact KPI event lane. It relies on observed
 * source types only and never promotes an inferred procedure to certified. */
export function isCompactTimelineEvent(event: Pick<RfEvent, "type" | "label" | "attrs" | "lane">) {
  const originalLane = laneFor(event, false);
  if (["dl", "ul", "volte", "vonr"].includes(originalLane)) return true;
  const name = `${event.type} ${event.label}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    /rrc(?:connection)?(?:request|setup|setupcomplete|reestablishment|reestablishmentcomplete|reestablishmentreject|release)/.test(
      name,
    ) ||
    /^(?:hoa|hos|hof|handover)/.test(name) ||
    name.includes("scgfailure") ||
    name.includes("radio link failure".replace(/ /g, "")) ||
    /(?:call|sipinvite|volte|vonr).*(?:attempt|setup|success|failure|release|drop)/.test(name)
  );
}
type TimelineMetric = {
  code: string;
  labelKey?: string;
  label?: string;
  unit: string;
  color: string;
};
const legacyMetrics: TimelineMetric[] = [
  { code: "cell_rsrp", labelKey: "cell_rsrp", unit: "dBm", color: rfColors["cell_rsrp"]! },
  { code: "cell_rsrq", labelKey: "cell_rsrq", unit: "dB", color: rfColors["cell_rsrq"]! },
  { code: "ci_rs_snr", labelKey: "ci_rs_snr", unit: "dB", color: rfColors["ci_rs_snr"]! },
];
const compactMetrics: TimelineMetric[] = [
  { code: "cell_rsrp@lte-type-0", labelKey: "lteRsrp", unit: "dBm", color: "#2563EB" },
  { code: "cell_rsrq@lte-type-0", labelKey: "lteRsrq", unit: "dB", color: "#0F766E" },
  { code: "cell_sinr@lte-type-0", labelKey: "lteSinr", unit: "dB", color: "#D97706" },
  { code: "cell_rsrp@nr-type-199", labelKey: "nrRsrp", unit: "dBm", color: "#7C3AED" },
  { code: "cell_rsrq@nr-type-199", labelKey: "nrRsrq", unit: "dB", color: "#DB2777" },
  { code: "cell_sinr@nr-type-199", labelKey: "nrSinr", unit: "dB", color: "#0891B2" },
];

export type TimelineEventGroup = { event: RfEvent; members: RfEvent[] };
/** Group only point events that would overlap at the current zoom. Task/state
 * intervals retain their exact independent geometry. Every source event stays
 * available in `members` for the cluster picker. */
export function clusterTimelineEvents(
  events: readonly RfEvent[],
  window: TimeWindow,
  pixelWidth: number,
  compactKpi = false,
): TimelineEventGroup[] {
  const threshold = ((window[1] - window[0]) / Math.max(320, pixelWidth)) * 22;
  const groups: TimelineEventGroup[] = [];
  for (const event of [...events].sort(
    (a, b) =>
      (a.t_rel_s ?? Number.POSITIVE_INFINITY) - (b.t_rel_s ?? Number.POSITIVE_INFINITY) ||
      a.seq - b.seq,
  )) {
    const point =
      event.t_rel_s !== null && !(event.t_rel_end_s !== null && event.t_rel_end_s > event.t_rel_s);
    const previous = groups.at(-1);
    if (
      point &&
      previous &&
      previous.members.every(
        (member) =>
          member.t_rel_s !== null &&
          !(member.t_rel_end_s !== null && member.t_rel_end_s > member.t_rel_s),
      ) &&
      laneFor(previous.event, compactKpi) === laneFor(event, compactKpi) &&
      Math.abs((event.t_rel_s ?? 0) - (previous.event.t_rel_s ?? 0)) <= threshold
    ) {
      previous.members.push(event);
    } else groups.push({ event, members: [event] });
  }
  return groups;
}
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
  excludedEventTypes = [],
  compactKpi = false,
  persistenceId,
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
  excludedEventTypes?: string[];
  /** KPI Analytics-only compact presentation. Signaling keeps its established layout. */
  compactKpi?: boolean;
  persistenceId?: string;
}) {
  const { t, i18n } = useTranslation();
  const [layers, setLayers] = useState(protocols);
  const storageScope = `bc4.kpi.timeline.v2.${persistenceId ?? captureId}`;
  const [extraMetrics, setExtraMetrics] = useState<TimelineMetric[]>(() => {
    if (!compactKpi) return [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(`${storageScope}.metrics`) ?? "[]");
      return Array.isArray(value)
        ? value.filter(
            (item): item is TimelineMetric =>
              !!item &&
              typeof item === "object" &&
              typeof item.code === "string" &&
              typeof item.label === "string" &&
              typeof item.unit === "string" &&
              typeof item.color === "string",
          )
        : [];
    } catch {
      return [];
    }
  });
  const metricDefinitions = useMemo(
    () => [...(compactKpi ? compactMetrics : legacyMetrics), ...extraMetrics],
    [compactKpi, extraMetrics],
  );
  const metricCodes = useMemo(
    () => metricDefinitions.map((metric) => metric.code),
    [metricDefinitions],
  );
  const [measures, setMeasures] = useState<string[]>(() => {
    if (!compactKpi) return legacyMetrics.map((metric) => metric.code);
    try {
      const value: unknown = JSON.parse(localStorage.getItem(`${storageScope}.visible`) ?? "[]");
      return Array.isArray(value) && value.every((item) => typeof item === "string") && value.length
        ? value
        : compactMetrics.map((metric) => metric.code);
    } catch {
      return compactMetrics.map((metric) => metric.code);
    }
  });
  const [measurementsOpen, setMeasurementsOpen] = useState(() => {
    if (!compactKpi) return true;
    try {
      return localStorage.getItem(`${storageScope}.measurements`) === "open";
    } catch {
      return false;
    }
  });
  const [ready, setReady] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [, redrawCursor] = useState(0);
  const [windowSeq, setWindowSeq] = useState<{ from_seq: number; to_seq: number }>();
  // Chip shown on click: the name of the clicked event or measurement, nothing else.
  const [nameTag, setNameTag] = useState<NameTag | null>(null);
  const [eventCluster, setEventCluster] = useState<RfEvent[] | null>(null);

  const host = useRef<HTMLDivElement>(null),
    root = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | undefined>(undefined);
  const callbacks = useRef({ onSelect, onRange });
  callbacks.current = { onSelect, onRange };
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setViewportHeight(Math.round(rect.height));
      setViewportWidth(Math.round(rect.width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!compactKpi) return;
    try {
      localStorage.setItem(`${storageScope}.visible`, JSON.stringify(measures));
      localStorage.setItem(`${storageScope}.measurements`, measurementsOpen ? "open" : "closed");
      localStorage.setItem(`${storageScope}.metrics`, JSON.stringify(extraMetrics));
    } catch {
      /* presentation persistence unavailable */
    }
  }, [compactKpi, extraMetrics, measurementsOpen, measures, storageScope]);
  const overview = useQuery({
    queryKey: ["signaling-rf-overview", projectId, captureId, technology, direction, search],
    queryFn: ({ signal }) =>
      getSignaling(
        projectId,
        "timeline",
        {
          capture_id: captureId,
          bucket_s: 10,
          technology: technology || undefined,
          direction: direction || undefined,
          q: search || undefined,
        },
        signal,
      ),
    staleTime: 60000,
  });
  const duration = overview.data?.t_rel_end_s ?? 0;
  const localWindow = useTimeWindow(
    captureId,
    duration,
    compactKpi ? DEFAULT_WINDOW_S : FULL_CAPTURE_S,
    compactKpi ? `${storageScope}.window` : undefined,
  );
  const visibleWindow = timeWindow ?? localWindow.window;
  const visibleWindowStart = visibleWindow[0];
  const visibleWindowEnd = visibleWindow[1];
  const changeWindow = onWindow ?? localWindow.setWindow;
  const detailEnabled = shouldLoadTimelineDetail(overview.isSuccess, duration, visibleWindow);
  const events = useQuery({
    queryKey: ["signaling-rf", projectId, captureId, technology, direction, search, visibleWindow],
    enabled: detailEnabled,
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
          from_s: visibleWindow[0],
          to_s: visibleWindow[1],
          limit: 5000,
        },
        signal,
      ),
    staleTime: 60000,
  });
  const detailed = useQuery({
    queryKey: ["signaling-rf-radio-window", projectId, captureId, metricCodes, windowSeq],
    enabled: !!windowSeq && (!compactKpi || measurementsOpen),
    queryFn: ({ signal }) => getMetricSeries(projectId, captureId, metricCodes, signal, windowSeq),
    staleTime: 60000,
  });
  // Read the page-level full radio query if it already exists, but never
  // trigger it from the timeline. Zoom-window data remains authoritative.
  const cachedRadio = useQuery({
    queryKey: ["signaling-rf-radio", projectId, captureId, metricCodes],
    queryFn: ({ signal }) => getMetricSeries(projectId, captureId, metricCodes, signal),
    enabled: false,
    staleTime: 60000,
  });
  useEffect(() => {
    if (!detailEnabled) {
      setWindowSeq(undefined);
      return;
    }
    const rows = events.data?.events ?? [];
    if (!rows.length) {
      setWindowSeq(undefined);
      return;
    }
    const from_seq = Math.min(...rows.map((event) => event.seq));
    const to_seq = Math.max(...rows.map((event) => event.seq_end ?? event.seq));
    setWindowSeq((current) =>
      current?.from_seq === from_seq && current.to_seq === to_seq ? current : { from_seq, to_seq },
    );
  }, [detailEnabled, events.data?.events]);
  const overviewStateEvents = useMemo(
    () => (overview.data?.state_events ?? []) as unknown as RfEvent[],
    [overview.data?.state_events],
  );
  const overviewTaskEvents = useMemo(
    () => (overview.data?.task_events ?? []) as unknown as RfEvent[],
    [overview.data?.task_events],
  );
  const eligibleEvents = useMemo(() => {
    const source = mergeTimelineEvents(
      overviewStateEvents,
      overviewTaskEvents,
      events.data?.events ?? [],
    );
    return source.filter((e) => {
      if (excludedEventTypes.includes(e.type)) return false;
      if (!e.attrs.protocol) return true;
      return (
        layers.includes(e.attrs.protocol) &&
        (e.attrs.protocol === "Procedures" ||
          allowedProtocols.includes(
            e.attrs.protocol === "Nemo" ? "Événements Nemo" : e.attrs.protocol,
          )) &&
        e.t_rel_s !== null
      );
    });
  }, [
    events.data,
    overviewStateEvents,
    overviewTaskEvents,
    layers,
    allowedProtocols,
    excludedEventTypes,
  ]);
  const states = useMemo(
    () => (stateTracksV2 ? provenStates(overviewStateEvents, captureId) : []),
    [stateTracksV2, overviewStateEvents, captureId],
  );
  const rrcSegments = useMemo(
    () => (stateTracksV2 ? rrcStateSegments(states, duration) : []),
    [stateTracksV2, states, duration],
  );
  const displayed = useMemo(() => {
    const source = eligibleEvents.filter((event) =>
      compactKpi
        ? isCompactTimelineEvent(event)
        : laneFor(event) !== "network" || isAllowedNetworkEvent(event),
    );
    const stateEvents = compactKpi
      ? []
      : states
          .filter(
            (state) =>
              state.track !== "RRC_STATE" &&
              statePresentation(state) !== null &&
              (!technology ||
                (technology === "LTE" ? state.technology === "LTE" : state.technology !== "LTE")),
          )
          .map((state) => {
            const presentation = statePresentation(state);
            const label = presentation
              ? t(`signalingV2.${presentation.key}`, { count: presentation.count ?? undefined })
              : "";
            return {
              ...state.event,
              label:
                state.track === "RRC_STATE" && state.state === "IDLE"
                  ? t("signalingV2.idle")
                  : presentation?.status
                    ? `${label} · ${t(`signalingV2.${presentation.status}`)}`
                    : label,
              attrs: {
                ...state.event.attrs,
                track: state.track === "UE_STATE" ? "ue_state" : "rrc_state",
              },
            };
          });
    return [...source.filter((event) => stateTrack(event) === null), ...stateEvents];
  }, [compactKpi, eligibleEvents, states, technology, t]);
  const series = detailed.data?.series ?? cachedRadio.data?.series;
  const overviewPoints = useMemo(
    () =>
      (overview.data?.buckets ?? []).map((bucket) => ({
        t: bucket.t_rel_s,
        count: Object.values(bucket.counts).reduce((sum, count) => sum + count, 0),
      })),
    [overview.data?.buckets],
  );
  const lanes = useMemo(
    () =>
      laneOrder.filter(
        (lane) =>
          (!compactKpi ||
            !["uestate", "volte", "vonr", "ping", "sms", "mobility"].includes(lane)) &&
          (lane === "network" ||
            (stateTracksV2 &&
              (!compactKpi || lane !== "uestate") &&
              (lane === "uestate" || lane === "rrcstate")) ||
            displayed.some((event) => laneFor(event, compactKpi) === lane)),
      ),
    [compactKpi, displayed, stateTracksV2],
  );
  const zoom: [number, number] =
    duration > 0
      ? [(visibleWindow[0] / duration) * 100, (visibleWindow[1] / duration) * 100]
      : [0, 100];
  const windowCallbacks = useRef({ changeWindow, duration });
  windowCallbacks.current = { changeWindow, duration };
  const cursorSeries = useMemo(
    () =>
      metricDefinitions.map((metric) => ({
        code: metric.code,
        label:
          metric.label ??
          t(compactKpi ? `timelineV2.${metric.labelKey}` : `rfTimeline.${metric.labelKey}`),
        unit: metric.unit,
        points: measures.includes(metric.code)
          ? (series ?? [])
              .filter((s) => s.code === metric.code)
              .flatMap((s) => s.points)
              .filter((p): p is typeof p & { value: number } => typeof p.value === "number")
              .sort((a, b) => a.t_rel_s - b.t_rel_s || a.seq - b.seq)
          : [],
      })),
    [compactKpi, metricDefinitions, series, measures, t],
  );
  const renderedEvents = useMemo(
    () =>
      compactKpi
        ? clusterTimelineEvents(displayed, visibleWindow, viewportWidth, true)
        : displayed.map((event) => ({ event, members: [event] })),
    [compactKpi, displayed, viewportWidth, visibleWindow],
  );
  const current = useRef({ displayed, series, duration, cursorSeries });
  current.current = { displayed, series, duration, cursorSeries };
  useEffect(() => {
    setWindowSeq(undefined);
    setNameTag(null);
    setEventCluster(null);
  }, [captureId]);
  // The chip is anchored to pixels, so it must not survive a pan or a zoom.
  useEffect(() => {
    setNameTag(null);
  }, [visibleWindowStart, visibleWindowEnd]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNameTag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
      const nameAt = (x: number, y: number) => {
        try {
          return nearestNameTag(
            current.current.cursorSeries,
            (code, time, value) => {
              const pixel = c.convertToPixel({ seriesId: code }, [time, value]) as
                number[] | undefined;
              return Array.isArray(pixel) ? [pixel[0] ?? NaN, pixel[1] ?? NaN] : null;
            },
            x,
            y,
          );
        } catch {
          return null;
        }
      };
      c.on("click", (ev: unknown) => {
        const p = ev as {
          data?: { event?: RfEvent; clusterEvents?: RfEvent[]; source?: string };
          event?: { offsetX: number; offsetY: number };
        };
        const x = p.event?.offsetX ?? 0;
        const y = p.event?.offsetY ?? 0;
        if (p.data?.event) {
          if ((p.data.clusterEvents?.length ?? 0) > 1) {
            setEventCluster(p.data.clusterEvents ?? null);
            setNameTag(null);
            return;
          }
          callbacks.current.onSelect(p.data.event);
          setEventCluster(null);
          setNameTag({ name: p.data.event.label, code: "event", x, y });
          return;
        }
        const near = nameAt(x, y);
        if (near) setNameTag(near);
        else if (p.data?.source)
          setNameTag({
            name: current.current.cursorSeries.find((s) => s.code === p.data!.source)?.label ?? "",
            code: p.data.source,
            x,
            y,
          });
        else setNameTag(null);
      });
      // Blank-area clicks reach zrender only: name the nearest measurement, if any.
      c.getZr().on("click", (ev: unknown) => {
        const e = ev as { target?: unknown; offsetX: number; offsetY: number };
        if (e.target) return;
        const near = nameAt(e.offsetX, e.offsetY);
        if (near) setNameTag(near);
        else setNameTag(null);
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
          data: renderedEvents.map(({ event, members }) => ({
            value: [
              lanes.indexOf(laneFor(event, compactKpi)),
              event.t_rel_s,
              event.t_rel_end_s ?? event.t_rel_s,
            ],
            event,
            clusterEvents: members,
            itemStyle: { opacity: event.id === selectedEventId || active.has(event.id) ? 1 : 0.65 },
          })),
        },
      ],
    });
  }, [compactKpi, selectedTime, selectedEventId, displayed, renderedEvents, ready, lanes]);
  useEffect(() => {
    const c = chart.current;
    if (!c || !duration || !c.getOption()?.["xAxis"]) return;
    c.dispatchAction(
      { type: "dataZoom", startValue: visibleWindow[0], endValue: visibleWindow[1] },
      { silent: true },
    );
    redrawCursor((revision) => revision + 1);
  }, [visibleWindow, duration, ready]);
  const showLabels = visibleWindow[1] - visibleWindow[0] <= 120;
  const laneLayout = useMemo(() => {
    if (!compactKpi) return stateLaneLayout(lanes);
    const centers = lanes.map((_, index) => 14 + index * 32);
    return { centers, height: Math.max(30, lanes.length * 32) };
  }, [compactKpi, lanes]);
  const trackHeight = stateTracksV2 ? laneLayout.height : 216;
  const rfTop = stateTracksV2 ? 30 + trackHeight + 22 : 292;
  const visibleMetricDefinitions = useMemo(
    () =>
      measurementsOpen ? metricDefinitions.filter((metric) => measures.includes(metric.code)) : [],
    [measurementsOpen, measures, metricDefinitions],
  );
  const rfGridCount = compactKpi ? visibleMetricDefinitions.length : metricDefinitions.length;
  const baseChartHeight = (stateTracksV2 ? rfTop + rfGridCount * 60 + 16 : 470) + 22;
  const chartHeight = compactKpi
    ? baseChartHeight
    : Math.max(baseChartHeight, viewportHeight > 0 ? viewportHeight - 44 : 0);
  const chartHeightExtra = chartHeight - baseChartHeight;
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const fmtT = (v: number) =>
      v.toLocaleString(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    const tokens = getComputedStyle(document.documentElement);
    const iconForeground = tokens.getPropertyValue("--signaling-icon-foreground").trim();
    const labelColor = tokens.getPropertyValue("--muted-foreground").trim();
    const renderItem: CustomSeriesRenderItem = (params, api) => {
      const lane = Number(api.value(0)),
        start = api.coord([api.value(1), lane]),
        end = api.coord([api.value(2), lane]);
      if (stateTracksV2) {
        const center = laneLayout.centers[lane];
        if (center === undefined) return;
        start[1] = 30 + center;
        end[1] = 30 + center;
      }
      const group = renderedEvents[params.dataIndex];
      const item = group?.event;
      if (!item) return;
      const track = eventTrack(item);
      const marker = eventIcon(item);
      const markerColor = tokens.getPropertyValue(`--signaling-icon-${marker.role}`).trim();
      const isBand =
        track === "lte" ||
        track === "nsa" ||
        track === "sa" ||
        (stateTracksV2 && (track === "ue_state" || track === "rrc_state"));
      const proof = states.find((state) => state.event.id === item.id);
      const stateRole = proof ? statePresentation(proof)?.role : undefined;
      const stateColor = getComputedStyle(document.documentElement)
        .getPropertyValue(`--signaling-state-${stateRole}`)
        .trim();
      const color = proof
        ? stateColor
        : marker.role === "error"
          ? rfColors["failure"]!
          : isBand
            ? (rfColors[track] ?? rfColors["unknown"]!)
            : track === "network"
              ? (rfProtocolColors[item.attrs.protocol ?? ""] ?? rfColors["unknown"]!)
              : (rfColors[track] ?? rfColors["unknown"]!);
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
      // UE State during Idle: leave the lane visually empty (no badge, no label).
      if (isBand && proof?.track === "UE_STATE" && proof.state === "IDLE") return;
      if (isBand) {
        const geometry = proof ? stateBandGeometry(proof, states) : { offset: 0, height: 22 };
        const y = (start[1] ?? 0) + geometry.offset;
        // RRC State lane renders as a compact pill badge for both Idle and Connected.
        const rrcBadge = proof?.track === "RRC_STATE";
        const idleBadge = rrcBadge && proof.state === "IDLE";
        const rrcText = rrcBadge
          ? proof.state === "IDLE"
            ? t("signalingV2.idle")
            : t("signalingV2.connected")
          : item.label;
        const bandWidth = rrcBadge ? Math.min(width, proof.state === "IDLE" ? 48 : 92) : width;
        const bandLeft = left + (width - bandWidth) / 2;
        children.push({
          type: "rect",
          shape: {
            x: bandLeft,
            y: y - (rrcBadge ? 18 : geometry.height) / 2,
            width: bandWidth,
            height: rrcBadge ? 18 : geometry.height,
            r: 5,
          },
          style: { fill: color, opacity },
        });
        if (rrcBadge ? bandWidth >= 40 : width > Math.max(70, item.label.length * 7 + 16))
          children.push({
            type: "text",
            style: {
              x: left + width / 2,
              y,
              text: rrcText,
              fill: idleBadge
                ? tokens.getPropertyValue("--sig-table-text").trim()
                : stateTracksV2
                  ? getComputedStyle(document.documentElement)
                      .getPropertyValue("--signaling-state-text")
                      .trim()
                  : "#ffffff",
              fontSize: 12,
              fontFamily: tokens.getPropertyValue("--font-sans").trim(),
              fontWeight: 600,
              align: "center",
              verticalAlign: "middle",
            },
          } as never);
      } else if (item.t_rel_end_s !== null && item.t_rel_end_s > (item.t_rel_s ?? 0)) {
        // Task icons remain part of the same event group and share its hit target.
        children.push({
          type: "rect",
          shape: { x: start[0]!, y: start[1]! - 7, width, height: 14, r: 7 },
          style: { fill: color, opacity },
        });
        if (width > 28) {
          children.push({
            type: "image",
            style: {
              image: iconImage(marker.icon, iconForeground),
              x: left + 4,
              y: (start[1] ?? 0) - 6,
              width: 12,
              height: 12,
            },
          });
          children.push({
            type: "circle",
            shape: { cx: right - 3, cy: start[1] ?? 0, r: 3 },
            style: { fill: iconForeground, stroke: color, lineWidth: 1 },
          });
        }
        if (!compactKpi && width > 90)
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
        if (!compactKpi && showLabels && width > 40) {
          // Start / End render below the bar (user spec), aligned on the exact extremities.
          children.push({
            type: "text",
            style: {
              x: start[0]!,
              y: start[1]! + 12,
              text: `Start\n${fmtT(item.t_rel_s ?? 0)} s`,
              fill: "#475569",
              fontSize: 8,
              align: "left",
              verticalAlign: "top",
            },
          } as never);
          children.push({
            type: "text",
            style: {
              x: end[0]!,
              y: start[1]! + 12,
              text: `End\n${fmtT(item.t_rel_end_s)} s`,
              fill: "#475569",
              fontSize: 8,
              align: "right",
              verticalAlign: "top",
            },
          } as never);
        }
      } else {
        // Lucide icon badge with a stem anchored at the exact capture timestamp.
        const x = start[0] ?? 0;
        const y = start[1] ?? 0;
        children.push({
          type: "line",
          shape: { x1: x, y1: y - 2, x2: x, y2: y + 10 },
          style: { stroke: markerColor, lineWidth: 1.5, opacity },
        });
        children.push({
          type: "circle",
          shape: { cx: x, cy: y - 7, r: 10 },
          style: { fill: markerColor, stroke: iconForeground, lineWidth: 1.5, opacity },
        });
        children.push({
          type: "image",
          style: {
            image: iconImage(marker.icon, iconForeground),
            x: x - 7,
            y: y - 14,
            width: 14,
            height: 14,
          },
        });
        children.push({
          type: "circle",
          shape: { cx: x, cy: y + 10, r: 2 },
          style: { fill: markerColor, opacity },
        });
        const nearby = displayed.some(
          (other) =>
            other.id !== item.id &&
            laneFor(other, compactKpi) === laneFor(item, compactKpi) &&
            other.t_rel_s !== null &&
            Math.abs((api.coord([other.t_rel_s, lane])[0] ?? 0) - x) < 90,
        );
        if (!compactKpi && showLabels && !nearby)
          children.push({
            type: "text",
            style: {
              x: start[0]!,
              y: y + 13,
              text: item.label,
              fill: labelColor,
              fontSize: 8,
              align: "center",
              verticalAlign: "top",
            },
          } as never);
        if ((group?.members.length ?? 0) > 1)
          children.push({
            type: "text",
            style: {
              x: x + 8,
              y: y - 17,
              text: String(group!.members.length),
              fill: "#FFFFFF",
              backgroundColor: "#0F172A",
              borderRadius: 8,
              padding: [2, 4],
              fontSize: 9,
              fontWeight: 700,
              align: "center",
            },
          } as never);
      }
      return { type: "group", children } as unknown as ReturnType<
        NonNullable<CustomSeriesRenderItem>
      >;
    };
    const renderRrcSegment: CustomSeriesRenderItem = (params, api) => {
      const item = rrcSegments[params.dataIndex];
      const lane = lanes.indexOf("rrcstate");
      const center = laneLayout.centers[lane];
      if (!item || lane < 0 || center === undefined) return;
      const start = api.coord([item.startS, lane]);
      const end = api.coord([item.endS, lane]);
      const coordSys = params.coordSys as unknown as { x: number; width: number };
      const left = Math.max(coordSys.x, start[0] ?? coordSys.x);
      const right = Math.min(coordSys.x + coordSys.width, end[0] ?? left);
      if (right <= left) return;
      const y = 30 + center;
      const height = compactKpi ? 26 : 34;
      const roundStart = item.roundStart && left === start[0];
      const roundEnd = item.roundEnd && right === end[0];
      const radius = [roundStart ? 5 : 0, roundEnd ? 5 : 0, roundEnd ? 5 : 0, roundStart ? 5 : 0];
      const fill =
        item.state === "CONNECTED" ? "#0EA5E9" : item.state === "IDLE" ? "#CBD5E1" : "#E2E8F0";
      const children: Record<string, unknown>[] = [
        {
          type: "rect",
          shape: { x: left, y: y - height / 2, width: right - left, height, r: radius },
          style: { fill },
        },
      ];
      if (item.state === "UNKNOWN") {
        for (let x = left - height; x < right + height; x += 10) {
          children.push({
            type: "line",
            shape: { x1: x, y1: y + height / 2, x2: x + height, y2: y - height / 2 },
            style: { stroke: "#94A3B8", lineWidth: 1, opacity: 0.65 },
          });
        }
      }
      const label =
        item.state === "CONNECTED"
          ? t("signalingV2.connected")
          : item.state === "IDLE"
            ? t("signalingV2.idle")
            : t("signalingV2.unknownShort");
      if (right - left > Math.max(54, label.length * 7 + 14)) {
        children.push({
          type: "text",
          style: {
            x: left + (right - left) / 2,
            y,
            text: label,
            fill: item.state === "CONNECTED" ? "#FFFFFF" : "#334155",
            fontSize: 12,
            fontFamily: tokens.getPropertyValue("--font-sans").trim(),
            fontWeight: 600,
            align: "center",
            verticalAlign: "middle",
          },
        } as never);
      }
      return {
        type: "group",
        clipPath: {
          type: "rect",
          shape: { x: left, y: y - height / 2, width: right - left, height, r: radius },
        },
        children,
      } as unknown as ReturnType<NonNullable<CustomSeriesRenderItem>>;
    };
    // V2: one RF sub-grid per metric, each with its own Y scale, sharing the X axis.
    const chartMetrics = compactKpi ? visibleMetricDefinitions : metricDefinitions;
    const rfGrids = stateTracksV2 ? chartMetrics.length : 1;
    const subH = 52 + (stateTracksV2 ? chartHeightExtra / Math.max(1, chartMetrics.length) : 0);
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
    const metricSeries = chartMetrics.map((metric, i) => ({
      id: metric.code,
      name:
        metric.label ??
        t(compactKpi ? `timelineV2.${metric.labelKey}` : `rfTimeline.${metric.labelKey}`),
      type: "line" as const,
      xAxisIndex: stateTracksV2 ? 1 + i : 1,
      yAxisIndex: stateTracksV2 ? 1 + i : 1,
      showSymbol: stateTracksV2,
      symbolSize: 2,
      connectNulls: false,
      lineStyle: { width: stateTracksV2 ? 1.2 : 1.6, color: metric.color },
      itemStyle: { color: metric.color },
      z: 2 + i,
      data: measures.includes(metric.code)
        ? (series?.find((s) => s.code === metric.code)?.points ?? []).map((p) => ({
            value: [p.t_rel_s, p.value],
            seq: p.seq,
            source: metric.code,
          }))
        : [],
    }));
    const options: EChartsOption = {
      animation: false,
      backgroundColor: "transparent",
      grid: [
        { top: 30, height: trackHeight, left: 112, right: 24 },
        ...(stateTracksV2
          ? chartMetrics.map((_, i) => ({
              top: rfTop + i * (subH + 8),
              height: subH,
              left: 112,
              right: 24,
            }))
          : [{ top: rfTop, height: 138 + chartHeightExtra, left: 112, right: 24 }]),
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
        data: chartMetrics.map(
          (metric) =>
            metric.label ??
            t(compactKpi ? `timelineV2.${metric.labelKey}` : `rfTimeline.${metric.labelKey}`),
        ),
      },
      xAxis: xAxes,
      yAxis: [
        {
          type: "category",
          inverse: true,
          data: lanes.map((k) =>
            stateTracksV2 && k === "rrcstate"
              ? rrcStateLaneLabel(t("signalingV2.rrcState"))
              : compactKpi
                ? t(
                    `timelineV2.${k === "network" ? "rrcEvents" : k === "dl" ? "dataDl" : k === "ul" ? "dataUl" : k}`,
                  )
                : t(
                    stateTracksV2 && (k === "uestate" || k === "rrcstate")
                      ? `signalingV2.${k === "uestate" ? "ueState" : "rrcState"}`
                      : `rfTimeline.${k}`,
                  ),
          ),
          axisLabel: {
            color: "#94a3b8",
            fontSize: 11,
            rich: {
              title: { color: "#94a3b8", fontSize: 11, fontWeight: 600 },
            },
          },
          axisTick: { show: false },
          axisLine: { show: false },
        },
        ...(stateTracksV2
          ? chartMetrics.map((metric, i) => ({
              type: "value" as const,
              gridIndex: 1 + i,
              scale: true,
              splitNumber: 2,
              name:
                metric.label ??
                t(compactKpi ? `timelineV2.${metric.labelKey}` : `rfTimeline.${metric.labelKey}`),
              nameLocation: "middle" as const,
              nameRotate: 0,
              nameGap: 46,
              nameTextStyle: { color: metric.color, fontSize: 10, align: "right" as const },
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
      brush: {
        xAxisIndex: xAxes.map((_, i) => i),
        brushType: "lineX",
        toolbox: [],
      },
      // ECharts crée une toolbox interne pour le brush : la masquer explicitement
      // (les icônes « sélection horizontale » et « Effacer la sélection »).
      toolbox: { show: false },
      tooltip: {
        show: compactKpi,
        trigger: "item",
        confine: true,
        formatter: (p: unknown) => {
          const d = (
            p as {
              data: {
                event?: RfEvent;
                clusterEvents?: RfEvent[];
                value?: unknown[];
                seq?: number;
                source?: string;
              };
            }
          ).data;
          if (d.event) {
            const e = d.event;
            if ((d.clusterEvents?.length ?? 0) > 1)
              return `<b>${escape(t("timelineV2.cluster", { count: d.clusterEvents!.length }))}</b><br/>${d.clusterEvents!.map((member) => `${fmtT(member.t_rel_s ?? 0)} s · ${escape(member.label)}`).join("<br/>")}`;
            const proof = states.find((state) => state.event.id === e.id);
            if (proof)
              return `<b>${escape(e.label)}</b><br/>${fmtT(proof.startS)} → ${fmtT(proof.endS)} s<br/>${escape(t("signalingV2.duration"))}: ${fmtT(proof.endS - proof.startS)} s<br/>${escape(proof.technology)} · ${escape(t("signalingV2.session"))}: ${escape(proof.sessionId)}<br/>${proof.componentCarriers === null ? "" : `${proof.componentCarriers} ${escape(t(`signalingV2.${proof.carrierStatus}`))}<br/>`}${escape(t("signalingV2.proof"))}: ${escape(proof.evidenceSeqs.join(", "))}`;
            const header = `<b>${escape(e.label)}</b><br/>${escape(t("timelineV2.timestamp"))}: ${fmtT(e.t_rel_s ?? 0)} s · #${e.seq}<br/>${escape(t("timelineV2.technology"))}: ${escape(e.attrs.technology)}<br/>${escape(t("timelineV2.procedure"))}: ${escape(e.attrs["procedure_type"] ?? e.type)}<br/>${escape(t("timelineV2.status"))}: ${escape(e.attrs.status)}<br/>${escape(t("timelineV2.evidence"))}: ${escape(e.attrs.evidence_status)}<br/>${e.duration_ms === null ? "" : `${escape(t("signalingV2.duration"))}: ${escape(e.duration_ms)} ms`}`;
            const fields = [
              "serving_cell",
              "pci",
              "earfcn",
              "nrarfcn",
              "hoa_pci",
              "hoa_att_pci",
              "hoa_ch_number",
              "hoa_att_ch",
              "cause",
            ]
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
          id: "overview-density",
          name: "Overview",
          type: "scatter",
          xAxisIndex: 0,
          yAxisIndex: 0,
          symbol: "rect",
          symbolSize: (value: unknown) => {
            const count = Number((value as unknown[])[2] ?? 0);
            return [3, Math.min(16, 3 + Math.sqrt(count))];
          },
          itemStyle: { color: rfColors["unknown"]!, opacity: detailEnabled ? 0.25 : 0.65 },
          data: overviewPoints.map((point) => ({
            value: [point.t, lanes.indexOf("network"), point.count],
          })),
          z: 1,
        },
        ...(stateTracksV2
          ? [
              {
                id: "rrc-state-segments",
                type: "custom" as const,
                renderItem: renderRrcSegment,
                encode: { x: [1, 2], y: 0 },
                clip: true,
                z: 3,
                tooltip: {
                  show: true,
                  formatter: (p: unknown) => {
                    const segment = (p as { data: { rrcSegment?: RrcStateSegment } }).data
                      .rrcSegment;
                    if (!segment) return "";
                    const name =
                      segment.state === "CONNECTED"
                        ? t("signalingV2.rrcLteConnected")
                        : segment.state === "IDLE"
                          ? t("signalingV2.idle")
                          : t("signalingV2.unknown");
                    const lines = [
                      `<b>${escape(t("signalingV2.rrcState"))}: ${escape(name)}</b>`,
                      `${escape(t("signalingV2.start"))}: ${fmtT(segment.startS)} s`,
                      `${escape(t("signalingV2.end"))}: ${fmtT(segment.endS)} s`,
                    ];
                    if (segment.proof) {
                      lines.push(
                        `${escape(t("signalingV2.duration"))}: ${fmtT(segment.endS - segment.startS)} s`,
                        `${escape(t("signalingV2.technology"))}: ${escape(segment.proof.technology)}`,
                        `${escape(t("signalingV2.proof"))}: ${escape(segment.proof.evidenceSeqs.join(", "))}`,
                      );
                    } else {
                      lines.push(escape(t("signalingV2.stateNotProven")));
                    }
                    return lines.join("<br/>");
                  },
                },
                data: rrcSegments.map((segment) => ({
                  value: [lanes.indexOf("rrcstate"), segment.startS, segment.endS],
                  rrcSegment: segment,
                })),
              },
            ]
          : []),
        {
          id: "events",
          type: "custom",
          renderItem,
          encode: { x: [1, 2], y: 0 },
          clip: true,
          data: renderedEvents.map(({ event, members }) => ({
            value: [
              lanes.indexOf(laneFor(event, compactKpi)),
              event.t_rel_s,
              event.t_rel_end_s ?? event.t_rel_s,
            ],
            event,
            clusterEvents: members,
          })),
        },
        ...metricSeries,
      ],
    };
    c.setOption(options, { replaceMerge: ["series", "grid", "xAxis", "yAxis"] });
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
    rrcSegments,
    trackHeight,
    rfTop,
    laneLayout,
    visibleWindow,
    overviewPoints,
    detailEnabled,
    chartHeightExtra,
    compactKpi,
    metricDefinitions,
    renderedEvents,
    visibleMetricDefinitions,
  ]);
  return (
    <div
      ref={root}
      className={`flex min-h-0 flex-1 flex-col bg-card${compactKpi ? " kpi-timeline-v2" : ""}`}
      data-testid="rf-timeline"
      data-task-count={overviewTaskEvents.length}
      data-icons-only={compactKpi || undefined}
      data-event-count={displayed.length}
      data-cluster-count={renderedEvents.filter((group) => group.members.length > 1).length}
      onDragOver={
        compactKpi
          ? (event) => {
              if (event.dataTransfer.types.includes(MAP_METRIC_MIME)) event.preventDefault();
            }
          : undefined
      }
      onDrop={
        compactKpi
          ? (event) => {
              const metric = readMapMetric(event.dataTransfer.getData(MAP_METRIC_MIME));
              if (!metric || metricDefinitions.some((item) => item.code === metric.code)) return;
              event.preventDefault();
              const colors = ["#16A34A", "#DC2626", "#9333EA", "#0284C7"];
              setExtraMetrics((items) => [
                ...items,
                {
                  code: metric.code,
                  label: metric.label,
                  unit: metric.unit,
                  color: colors[items.length % colors.length]!,
                },
              ]);
              setMeasures((items) => [...items, metric.code]);
              setMeasurementsOpen(true);
            }
          : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-2" aria-hidden="true">
          {severityLegend.map((s) => (
            <span key={s.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {t(`rfTimeline.legend.${s.key}`)}
            </span>
          ))}
        </span>
        <details open={compactKpi ? undefined : false}>
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
        <details
          open={compactKpi ? measurementsOpen : undefined}
          onToggle={
            compactKpi ? (event) => setMeasurementsOpen(event.currentTarget.open) : undefined
          }
        >
          <summary className="kpi-button" aria-expanded={measurementsOpen}>
            {t(compactKpi ? "timelineV2.measurements" : "rfTimeline.measures")}
          </summary>
          <div className="flex flex-wrap gap-2 p-2">
            {metricDefinitions.map((metric) => (
              <label key={metric.code}>
                <input
                  type="checkbox"
                  checked={measures.includes(metric.code)}
                  onChange={() =>
                    setMeasures((v) =>
                      v.includes(metric.code)
                        ? v.filter((x) => x !== metric.code)
                        : [...v, metric.code],
                    )
                  }
                />
                {metric.label ??
                  t(compactKpi ? `timelineV2.${metric.labelKey}` : `rfTimeline.${metric.labelKey}`)}
              </label>
            ))}
          </div>
        </details>
      </div>
      {overview.isPending && <p role="status">{t("rfTimeline.loading")}</p>}
      {[overview, events, detailed]
        .filter((q) => q.isError)
        .map((q, i) => (
          <p key={i} role="alert">
            {String(q.error.message)}
          </p>
        ))}
      <div ref={viewport} className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ minWidth: 320 }}>
          {stateTracksV2 &&
            (compactKpi ? (["rrcstate"] as const) : (["uestate", "rrcstate"] as const)).map(
              (lane) => {
                const index = lanes.indexOf(lane);
                const center = laneLayout.centers[index];
                const title = stateLaneTitle(lane, {
                  ueState: t("signalingV2.ueState"),
                  rrcState: t("signalingV2.rrcState"),
                });
                return center === undefined ? null : (
                  <span
                    key={lane}
                    className="pointer-events-none absolute left-0 z-10 flex h-[42px] w-[106px] items-center gap-1.5 bg-card text-xs font-semibold text-foreground"
                    style={{ top: 30 + center - 21 }}
                  >
                    {title.title}
                  </span>
                );
              },
            )}
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
            series={compactKpi && !measurementsOpen ? [] : cursorSeries}
            zoom={zoom}
            duration={duration}
            onTime={onTime}
            onMessage={onSelect}
            stateTracksV2={stateTracksV2}
            captureId={captureId}
          />
          {nameTag && nameTag.name ? (
            <span
              className={`signaling-name-tag${nameTag.y < 44 ? " below" : ""}`}
              data-testid="rf-name-tag"
              role="status"
              style={{
                left: clampNameTagX(nameTag.x, host.current?.clientWidth ?? 480),
                top: nameTag.y < 44 ? nameTag.y + 14 : nameTag.y - 10,
              }}
            >
              {nameTag.name}
            </span>
          ) : null}
          {eventCluster ? (
            <div
              className="kpi-timeline-cluster"
              role="dialog"
              aria-label={t("timelineV2.clusterPicker")}
            >
              <div className="flex items-center justify-between gap-2">
                <strong>{t("timelineV2.cluster", { count: eventCluster.length })}</strong>
                <button type="button" className="kpi-button" onClick={() => setEventCluster(null)}>
                  {t("timelineV2.close")}
                </button>
              </div>
              {eventCluster.map((event) => (
                <button
                  key={`${captureId}:${event.seq}:${event.id}`}
                  type="button"
                  onClick={() => {
                    callbacks.current.onSelect(event);
                    setEventCluster(null);
                  }}
                >
                  <span>
                    {(event.t_rel_s ?? 0).toLocaleString(i18n.language, {
                      maximumFractionDigits: 3,
                    })}{" "}
                    s
                  </span>
                  <span>{event.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <TimeNavigator duration={duration} window={visibleWindow} onWindow={changeWindow} />
      </div>
    </div>
  );
}
