import { useEffect, useMemo, useRef, useState } from "react";
import type { ECharts } from "echarts";
import type { RfEvent } from "@/lib/api/signaling";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { X, ArrowRight, Crosshair } from "lucide-react";
import { clampWindow } from "./time-window";
import { provenStates, stateLabelKey } from "./state-evidence";
import {
  activeIntervals,
  availableTimes,
  previousObservation,
  stepTime,
  type Observation,
} from "./cursor";

export type CursorSeries = { code: string; label: string; unit: string; points: Observation[] };
function hasAxes(chart: ECharts | undefined, xIndex: number, yIndex?: number): chart is ECharts {
  if (!chart || chart.isDisposed()) return false;
  const option = chart.getOption();
  const xAxes = option?.["xAxis"];
  const yAxes = option?.["yAxis"];
  return (
    Array.isArray(xAxes) &&
    xAxes[xIndex] !== undefined &&
    (yIndex === undefined || (Array.isArray(yAxes) && yAxes[yIndex] !== undefined))
  );
}
export function TimeCursor({
  chart,
  host,
  selectedTime,
  eventId,
  events,
  series,
  zoom,
  duration,
  onTime,
  onMessage,
  stateTracksV2 = false,
  captureId,
}: {
  chart: ECharts | undefined;
  host: React.RefObject<HTMLDivElement | null>;
  selectedTime: number | null;
  eventId: string | null;
  events: RfEvent[];
  series: CursorSeries[];
  zoom: [number, number];
  duration: number;
  onTime: (time: number | null) => void;
  onMessage: (event: RfEvent, seq: number) => void;
  stateTracksV2?: boolean;
  captureId?: string;
}) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 480, height: 420 });
  const [dismissed, setDismissed] = useState(false);
  const [, refreshGeometry] = useState(0);
  const drag = useRef(false);
  const frame = useRef<number | undefined>(undefined);
  const latest = useRef({ onTime, selectedTime });
  latest.current = { onTime, selectedTime };
  const times = useMemo(
    () =>
      availableTimes(
        events,
        series.flatMap((s) => s.points),
      ),
    [events, series],
  );
  useEffect(() => setDismissed(false), [selectedTime, eventId]);
  useEffect(() => {
    const element = host.current;
    if (!element || !chart || chart.isDisposed()) return;
    // ECharts initializes its axes after the overlay mounts. Redraw when pixels
    // become available, and after resize/zoom, not only after pointer movement.
    const updateGeometry = () => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
      refreshGeometry((revision) => revision + 1);
    };
    updateGeometry();
    chart.on("finished", updateGeometry);
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(element);
    const timeAt = (event: PointerEvent) => {
      if (!hasAxes(chart, 0)) return null;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      if (x < 112 || x > rect.width - 24) return null;
      const result = chart.convertFromPixel({ xAxisIndex: 0 }, x) as number;
      return Number.isFinite(result) ? Math.max(0, Math.min(duration, result)) : null;
    };
    const move = (event: PointerEvent) => {
      const time = timeAt(event);
      const dragging = drag.current;
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        if (dragging && time !== null) latest.current.onTime(time);
        else setHover(time);
      });
    };
    const down = (event: PointerEvent) => {
      if (!hasAxes(chart, 0)) return;
      // Chart markers own exact snapping; background clicks stay in free mode.
      const hit = chart.getZr().handler.findHover(event.offsetX, event.offsetY).target;
      if (hit) return;
      const time = timeAt(event);
      if (time !== null) latest.current.onTime(time);
    };
    const leave = () => {
      if (!drag.current) {
        if (frame.current !== undefined) cancelAnimationFrame(frame.current);
        setHover(null);
      }
    };
    const up = () => {
      drag.current = false;
    };
    const windowMove = (event: PointerEvent) => {
      if (drag.current) move(event);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointerleave", leave);
    window.addEventListener("pointermove", windowMove);
    window.addEventListener("pointerup", up);
    return () => {
      observer.disconnect();
      if (!chart.isDisposed()) chart.off("finished", updateGeometry);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointermove", windowMove);
      window.removeEventListener("pointerup", up);
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [chart, host, duration]);
  const visible = (time: number) =>
    time >= (duration * zoom[0]) / 100 && time <= (duration * zoom[1]) / 100;
  const xAt = (time: number) => {
    if (!hasAxes(chart, 0)) return NaN;
    return chart.convertToPixel({ xAxisIndex: 0 }, time) as number;
  };
  const time = hover ?? selectedTime;
  const x = time === null ? null : xAt(time);
  const selectedX = selectedTime === null ? null : xAt(selectedTime);
  const event = hover === null ? events.find((e) => e.id === eventId) : undefined;
  const intervals = time === null ? [] : activeIntervals(events, time);
  const suppliedStates = useMemo(
    () => stateTracksV2 && captureId ? provenStates(events, captureId) : [],
    [events, captureId, stateTracksV2],
  );
  const states = time === null ? [] : suppliedStates.filter((state) => state.startS <= time && time < state.endS);
  const readings =
    time === null
      ? []
      : series.map((s, index) => ({ ...s, index, point: previousObservation(s.points, time) }));
  const fmt = (v: number) =>
    v.toLocaleString(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const panelWidth = Math.min(240, size.width - 16);
  const panelX =
    x === null
      ? 0
      : Math.max(
          8,
          Math.min(
            size.width - panelWidth - 8,
            x + panelWidth + 14 < size.width ? x + 14 : x - panelWidth - 14,
          ),
        );
  return (
    <>
      <svg
        className="signaling-cursor-overlay"
        width={size.width}
        height={size.height}
        aria-hidden="true"
      >
        {selectedTime !== null &&
          selectedX !== null &&
          Number.isFinite(selectedX) &&
          visible(selectedTime) && (
            <line
              data-testid="time-cursor-line"
              x1={selectedX}
              x2={selectedX}
              y1={26}
              y2={size.height - 38}
              className="signaling-cursor-line"
            />
          )}
        {hover !== null && x !== null && Number.isFinite(x) && visible(hover) && (
          <line x1={x} x2={x} y1={26} y2={size.height - 38} className="signaling-cursor-preview" />
        )}
        {readings.map((s) => {
          if (
            !hasAxes(chart, 1, 1) ||
            !s.point ||
            s.point.value === null ||
            !visible(s.point.t_rel_s)
          )
            return null;
          const coords = chart.convertToPixel({ seriesId: s.code }, [
            s.point.t_rel_s,
            s.point.value,
          ]) as number[];
          const [cx, cy] = coords;
          return cx !== undefined &&
            cy !== undefined &&
            Number.isFinite(cx) &&
            Number.isFinite(cy) ? (
            <circle
              key={s.code}
              cx={cx}
              cy={cy}
              r={4}
              className={`signaling-rf-marker signaling-metric-${s.index}`}
            />
          ) : null;
        })}
      </svg>
      {selectedTime !== null &&
        selectedX !== null &&
        Number.isFinite(selectedX) &&
        visible(selectedTime) && (
          <Button
            variant="ghost"
            size="sm"
            className="signaling-cursor-handle"
            style={{ left: Math.max(0, Math.min(size.width - 90, selectedX - 45)) }}
            role="slider"
            aria-label={t("rfTimeline.cursor")}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={selectedTime}
            aria-valuetext={`${fmt(selectedTime)} s`}
            data-testid="time-cursor-handle"
            onPointerDown={(e) => {
              e.preventDefault();
               e.stopPropagation();
              drag.current = true;
              setHover(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onTime(null);
              }
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                onTime(stepTime(times, selectedTime, e.key === "ArrowLeft" ? -1 : 1));
              }
            }}
          >
            {fmt(selectedTime)} s
          </Button>
        )}
      {selectedTime !== null && !visible(selectedTime) && (
        <Button
          variant="outline"
          size="sm"
          className="absolute right-2 top-2"
          onClick={() => {
            if (!hasAxes(chart, 0)) return;
            const width = (duration * (zoom[1] - zoom[0])) / 100;
            const range = clampWindow(duration, selectedTime - width / 2, width);
            chart.dispatchAction({
              type: "dataZoom",
              startValue: range[0],
              endValue: range[1],
            });
          }}
        >
          <Crosshair />
          {t("rfTimeline.outside")}
        </Button>
      )}
      {time !== null &&
        x !== null &&
        Number.isFinite(x) &&
        visible(time) &&
        (!dismissed || hover !== null) && (
          <div
            className="signaling-cursor-tooltip"
            style={{ left: panelX, width: panelWidth }}
            data-testid="time-cursor-tooltip"
          >
            <header className="flex items-center justify-between gap-2">
              <strong className="font-mono">t = {fmt(time)} s</strong>
              {hover === null && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  aria-label={t("common.clear")}
                  onClick={() => setDismissed(true)}
                >
                  <X />
                </Button>
              )}
            </header>
            {event && (
              <div className="mt-1">
                <strong>{event.label}</strong>
                <p>
                  {event.attrs.technology ?? "—"} · {event.attrs.status ?? event.outcome ?? "—"}
                </p>
                <small>
                  {event.attrs.evidence_status ?? "—"} · {event.link_rule}
                </small>
              </div>
            )}
            <div className="mt-2 space-y-1">
              {readings
                .filter((s) => s.point?.value !== null && s.point?.value !== undefined)
                .map((s) => (
                  <div key={s.code}>
                    <span className={`signaling-metric-${s.index}`}>
                      {s.label}:{" "}
                      {s.point?.value?.toLocaleString(i18n.language, { maximumFractionDigits: 2 })}{" "}
                      {s.unit}
                    </span>
                    <small className="block text-muted-foreground">
                      {t(s.point?.t_rel_s === time ? "rfTimeline.exact" : "rfTimeline.previous")} ·
                      Δt {fmt(time - (s.point?.t_rel_s ?? time))} s · #{s.point?.seq}
                    </small>
                  </div>
                ))}
              {!readings.some((s) => s.point?.value !== null && s.point?.value !== undefined) && (
                <p>{t("rfTimeline.noRF")}</p>
              )}
            </div>
            {stateTracksV2 &&
              ["UE_STATE", "RRC_STATE"].map((track) => (
                <div key={track} className="mt-2 border-t pt-1">
                  <strong>
                    {t(track === "UE_STATE" ? "signalingV2.ueState" : "signalingV2.rrcState")}
                  </strong>
                  {states.some((state) => state.track === track) ? (
                    states
                      .filter((state) => state.track === track)
                      .map((state) => (
                        <p key={state.event.id}>
                          {state.technology} · {t(stateLabelKey(state))}
                          {state.componentCarriers !== null && (
                            <>
                              {" "}
                              · {state.componentCarriers} {t(`signalingV2.${state.carrierStatus}`)}
                            </>
                          )}
                          <small className="block">
                            {t("signalingV2.session")}: {state.sessionId} · #
                            {state.evidenceSeqs.join(", #")}
                          </small>
                        </p>
                      ))
                  ) : (
                    <p>{t("signalingV2.unknown")}</p>
                  )}
                </div>
              ))}
            {intervals
              .filter(
                (e) => !stateTracksV2 || !["ue_state", "rrc_state"].includes(e.attrs.track ?? ""),
              )
              .map((e) => (
                <p key={e.id} className="mt-1">
                  {e.label} · {fmt(e.t_rel_s ?? time)} → {fmt(e.t_rel_end_s ?? time)} s ·{" "}
                  {e.attrs.status ?? "—"}
                </p>
              ))}
            {event && event.linked_seqs.length > 0 && (
              <div className="mt-2 border-t pt-1">
                <p>{t("rfTimeline.messageCount", { count: event.linked_seqs.length })}</p>
                <div className="flex flex-wrap gap-1">
                  {event.linked_seqs.map((seq) => (
                    <Button
                      key={seq}
                      variant="link"
                      size="sm"
                      className="h-6 px-1"
                      onClick={() => onMessage(event, seq)}
                    >
                      #{seq}
                      <ArrowRight />
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </>
  );
}
