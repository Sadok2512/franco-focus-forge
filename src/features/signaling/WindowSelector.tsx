import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clampWindow, type TimeWindow } from "./time-window";

export const WINDOW_PRESETS = [10, 30, 60, 120] as const;
export function WindowSelector({
  duration,
  window,
  onWindow,
}: {
  duration: number;
  window: TimeWindow;
  onWindow: (window: TimeWindow) => void;
}) {
  const { t } = useTranslation();
  const width = window[1] - window[0];
  const preset = WINDOW_PRESETS.find((size) => Math.abs(width - size) < 0.000001);
  const value =
    window[0] === 0 && window[1] === duration ? "fit" : preset ? String(preset) : "custom";
  return (
    <Select
      value={value}
      disabled={duration <= 0}
      onValueChange={(next) => {
        if (next === "fit") onWindow([0, duration]);
        else onWindow(clampWindow(duration, window[0], Number(next)));
      }}
    >
      <SelectTrigger className="h-7 w-32 text-xs" aria-label={t("timeNavigator.size")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {WINDOW_PRESETS.map((size) => (
          <SelectItem key={size} value={String(size)}>
            {t("signalingV2.window", { size })}
          </SelectItem>
        ))}
        <SelectItem value="fit">{t("signalingV2.fit")}</SelectItem>
        <SelectItem value="custom" disabled>
          {t("signalingV2.window", { size: Number(width.toFixed(3)) })}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
