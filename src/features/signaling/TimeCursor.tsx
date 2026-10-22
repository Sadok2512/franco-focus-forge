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
  const [dismissed, setDismissed] = useState(true);
  const previousSelection = useRef({ selectedTime, eventId });
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
  useEffect(() => {
    const previous = previousSelection.current;
    if (previous.selectedTime !== selectedTime || previous.eventId !== eventId) {
      setDismissed(false);
    }
    previousSelection.current = { selectedTime, eventId };
  }, [selectedTime, eventId]);
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
      if (time !== null) {
        setDismissed(false);
        latest.current.onTime(time);
      }
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
          ]) as number[] | undefined;
          if (!Array.isArray(coords)) return null;
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
              setDismissed(false);
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
      <div className="signaling-rf-readout" data-testid="rf-readout">
        {series.map((s, index) => {
          const point = time === null ? null : previousObservation(s.points, time);
          const value = point?.value ?? null;
          const dt = point && time !== null ? time - point.t_rel_s : 0;
          return (
            <span key={s.code} className={`signaling-metric-${index}`} data-testid={`rf-readout-${s.code}`}>
              {s.label}:{" "}
              {value === null
                ? t("common.na")
                : `${value.toLocaleString(i18n.language, { maximumFractionDigits: 1 })} ${s.unit}`}
              {value !== null && dt > 0 && <small> · Δt {fmt(dt)} s</small>}
            </span>
          );
        })}
      </div>
    </>
  );
}
