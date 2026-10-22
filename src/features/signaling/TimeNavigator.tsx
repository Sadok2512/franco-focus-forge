import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clampWindow, type TimeWindow } from "./time-window";

export function TimeNavigator({ duration, window, onWindow }: {
  duration: number; window: TimeWindow; onWindow: (window: TimeWindow) => void;
}) {
  const { t, i18n } = useTranslation();
  const drag = useRef<{ x: number; start: number; width: number } | null>(null);
  const width = window[1] - window[0];
  const fmt = (time: number) => time.toLocaleString(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const changeSize = (size: number) => onWindow(clampWindow(duration, (window[0] + window[1] - size) / 2, size));
  const action = (key: string, Icon: typeof ChevronLeft, onClick: () => void, disabled = false) => (
    <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" title={t(`timeNavigator.${key}`)} aria-label={t(`timeNavigator.${key}`)} onClick={onClick} disabled={duration <= 0 || disabled}><Icon className="h-3.5 w-3.5" /></Button>
  );
  return <div className="shrink-0 border-t pt-2" data-testid="time-navigator" data-start={window[0]} data-end={window[1]}>
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <strong className="mr-auto">{t("timeNavigator.title")}</strong>
      {action("previous", ChevronLeft, () => onWindow(clampWindow(duration, window[0] - width, width)), window[0] <= 0)}
      {action("next", ChevronRight, () => onWindow(clampWindow(duration, window[0] + width, width)), window[1] >= duration)}
      <Select value={[10, 30, 60, 120].includes(width) ? String(width) : "custom"} onValueChange={(value) => changeSize(Number(value))} disabled={duration <= 0}>
        <SelectTrigger className="h-7 w-24 text-xs" aria-label={t("timeNavigator.size")}><SelectValue /></SelectTrigger>
        <SelectContent>{[10, 30, 60, 120].map((size) => <SelectItem key={size} value={String(size)}>{size} s</SelectItem>)}<SelectItem value="custom" disabled>{fmt(width)} s</SelectItem></SelectContent>
      </Select>
      {action("zoomIn", ZoomIn, () => changeSize(Math.max(0.1, width / 2)))}
      {action("zoomOut", ZoomOut, () => changeSize(Math.min(duration, width * 2)))}
      {action("reset", RotateCcw, () => onWindow(clampWindow(duration, 0, 30)))}
      {action("full", Scan, () => onWindow([0, duration]))}
    </div>
    <div className="relative mt-2 h-7 touch-none rounded border bg-muted" data-testid="time-navigator-track"
      onPointerDown={(event) => {
        if (duration <= 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const time = (event.clientX - rect.left) / rect.width * duration;
        const start = event.target === event.currentTarget ? clampWindow(duration, time - width / 2, width)[0] : window[0];
        drag.current = { x: event.clientX, start, width: rect.width };
        event.currentTarget.setPointerCapture(event.pointerId);
        onWindow(clampWindow(duration, start, width));
      }}
      onPointerMove={(event) => { const current = drag.current; if (current) onWindow(clampWindow(duration, current.start + (event.clientX - current.x) / current.width * duration, width)); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="absolute inset-y-0 min-w-1 cursor-ew-resize rounded border border-primary bg-primary/20 focus-visible:outline focus-visible:outline-ring" role="slider" tabIndex={0}
        aria-label={t("timeNavigator.window")} aria-valuemin={0} aria-valuemax={Math.max(0, duration - width)} aria-valuenow={window[0]} aria-valuetext={`${fmt(window[0])}–${fmt(window[1])} s`}
        style={{ left: `${duration ? window[0] / duration * 100 : 0}%`, width: `${duration ? width / duration * 100 : 100}%` }}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); onWindow(clampWindow(duration, window[0] + (event.key === "ArrowLeft" ? -width : width), width)); } }} />
    </div>
    <div className="mt-1 flex justify-between gap-2 font-mono text-[10px] text-muted-foreground"><span>0 s</span><output>{fmt(window[0])}–{fmt(window[1])} s</output><span>{fmt(duration)} s</span></div>
  </div>;
}