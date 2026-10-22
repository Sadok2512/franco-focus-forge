import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WindowSelector } from "./WindowSelector";
import { clampWindow, resizeWindow, type TimeWindow } from "./time-window";

export function TimeNavigator({
  duration,
  window,
  onWindow,
}: {
  duration: number;
  window: TimeWindow;
  onWindow: (window: TimeWindow) => void;
}) {
  const { t, i18n } = useTranslation();
  const drag = useRef<{
    x: number;
    window: TimeWindow;
    pixels: number;
    edge?: "start" | "end";
  } | null>(null);
  const width = window[1] - window[0];
  const fmt = (time: number) =>
    time.toLocaleString(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const changeSize = (size: number) =>
    onWindow(clampWindow(duration, (window[0] + window[1] - size) / 2, size));
  const action = (key: string, Icon: typeof ChevronLeft, onClick: () => void, disabled = false) => (
    <Button
      variant="outline"
      size="icon"
      className="h-7 w-7 shrink-0"
      title={t(`timeNavigator.${key}`)}
      aria-label={t(`timeNavigator.${key}`)}
      onClick={onClick}
      disabled={duration <= 0 || disabled}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
  return (
    <div
      className="shrink-0 border-t pt-2"
      data-testid="time-navigator"
      data-start={window[0]}
      data-end={window[1]}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <strong className="mr-auto">{t("timeNavigator.title")}</strong>
        {action(
          "previous",
          ChevronLeft,
          () => onWindow(clampWindow(duration, window[0] - width, width)),
          window[0] <= 0,
        )}
        {action(
          "next",
          ChevronRight,
          () => onWindow(clampWindow(duration, window[0] + width, width)),
          window[1] >= duration,
        )}
        <WindowSelector duration={duration} window={window} onWindow={onWindow} />
        {action("zoomIn", ZoomIn, () => changeSize(Math.max(0.1, width / 2)))}
        {action("zoomOut", ZoomOut, () => changeSize(Math.min(duration, width * 2)))}
        {action("reset", RotateCcw, () => onWindow(clampWindow(duration, 0, 30)))}
        {action("full", Scan, () => onWindow([0, duration]))}
      </div>
      <div
        className="relative mt-2 h-7 touch-none rounded border bg-muted"
        data-testid="time-navigator-track"
        onPointerDown={(event) => {
          if (duration <= 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const time = ((event.clientX - rect.left) / rect.width) * duration;
          const start =
            event.target === event.currentTarget
              ? clampWindow(duration, time - width / 2, width)[0]
              : window[0];
          const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-edge]");
          const edge = handle?.dataset["edge"];
          drag.current = {
            x: event.clientX,
            window: clampWindow(duration, start, width),
            pixels: rect.width,
            ...(edge === "start" || edge === "end" ? { edge } : {}),
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          onWindow(clampWindow(duration, start, width));
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pixels <= 0) return;
          const delta = ((event.clientX - current.x) / current.pixels) * duration;
          onWindow(current.edge
            ? resizeWindow(current.window, current.edge,
                current.window[current.edge === "start" ? 0 : 1] + delta, duration)
            : clampWindow(duration, current.window[0] + delta,
                current.window[1] - current.window[0]));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className="signaling-navigator-window absolute inset-y-0 min-w-1 cursor-ew-resize rounded border focus-visible:outline focus-visible:outline-ring"
          role="slider"
          tabIndex={0}
          aria-label={t("timeNavigator.window")}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, duration - width)}
          aria-valuenow={window[0]}
          aria-valuetext={`${fmt(window[0])}–${fmt(window[1])} s`}
          style={{
            left: `${duration ? (window[0] / duration) * 100 : 0}%`,
            width: `${duration ? (width / duration) * 100 : 100}%`,
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              onWindow(
                clampWindow(
                  duration,
                  window[0] + (event.key === "ArrowLeft" ? -width : width),
                  width,
                ),
              );
            }
          }}
        >
          {(["start", "end"] as const).map((edge) => (
            <Button
              key={edge}
              variant="ghost"
              size="icon"
              data-edge={edge}
              data-testid={`time-navigator-${edge}`}
              aria-label={t(`timeNavigator.${edge}`)}
              className={`signaling-navigator-edge absolute inset-y-0 h-full w-2 min-w-0 cursor-ew-resize p-0 ${edge === "start" ? "left-0" : "right-0"}`}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                event.stopPropagation();
                onWindow(resizeWindow(window, edge,
                  window[edge === "start" ? 0 : 1] + (event.key === "ArrowLeft" ? -0.1 : 0.1), duration));
              }}
            />
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between gap-2 font-mono text-[10px] text-muted-foreground">
        <span>0 s</span>
        <output>
          {fmt(window[0])}–{fmt(window[1])} s
        </output>
        <span>{fmt(duration)} s</span>
      </div>
    </div>
  );
}
